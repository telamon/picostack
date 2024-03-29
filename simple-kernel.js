// Kernel includes
const Repo = require('picorepo')
const Store = require('@telamon/picostore')
const Feed = require('picofeed')
const { pack, unpack } = require('msgpackr')
const SimpleRPC = require('./simple-rpc')
const KEY_SK = 'reg/sk'

/* This is a simple but complete pico-kernel,
 * It sets up a user-identity, store and rpc.
 * It uses msgpack as block-encoder and also injects
 * sequence-number, type and timestamp props into each block.
 *
 * If you need something more advanced feel free to
 * fork off and hack. <3
 */
class SimplePicoKernel {
  constructor (db, opts = {}) {
    // Setup store
    this.db = db
    this.repo = new Repo(db)
    this.store = new Store(this.repo, this.mergeStrategy.bind(this))
    // this.store.mutexTimeout = 600000000
    this.ready = false
    this._secret = opts.secret ?? null

    // Setup network
    this.rpc = new SimpleRPC({
      onconnect: send => this.onconnect(send),
      ondisconnect: peer => this.ondisconnect(peer),
      onquery: (q, reply) => this.onquery(q, reply),
      onblocks: feed => this.onblocks(feed)
    })
  }

  /**
   * Returns user's public key (same thing as userId)
   */
  get pk () {
    return this._secret?.slice(32)
  }

  async boot () {
    if (this.__loading) return this.__loading
    this.__loading = (async () => {
      // If identity wasn't provided via opts.
      if (!this._secret) {
        try {
          // Attempt to restore existing identity
          this._secret = await this.repo.readReg(KEY_SK)
        } catch (err) {
          if (!err.notFound) throw err
        }
      }

      // Fallback to generate new identity
      if (!this._secret) {
        const { sk } = Feed.signPair()
        this._secret = sk
        await this.repo.writeReg(KEY_SK, sk)
      }

      await this.store.load() // load stores
      this.ready = true
    })()
    return this.__loading
  }

  /**
   * PicoRepo: Default merge strategy restricts feeds
   * to only allow same-author blocks to be appended.
   * Override this method if you need different behavior.
   */
  mergeStrategy (block, repo) {
    return false
  }

  /**
   * Returns user's feed
   */
  async feed (limit = undefined) {
    this._checkReady()
    return this.repo.loadHead(this.pk)
  }

  _checkReady () {
    if (!this.ready) throw new Error('Kernel not ready, did you await kernel.boot()?')
  }

  /**
   * Returns the last block number of user
   * Block sequence starts from 0 and increments by 1 for each new user-block
   */
  async seq () {
    const feed = await this.feed(1)
    if (!feed) return -1
    return SimplePicoKernel.decodeBlock(feed.last.body).seq
  }

  /**
   * Mutates store and reduced state
   * returns {string[]} names of stores that were modified by this action
   */
  async dispatch (patch, loudFail = false) {
    this._checkReady()
    const mut = await this.store.dispatch(patch, loudFail)
    // Transmit accepted blocks on all wires
    if (mut.length) this.rpc.shareBlocks(mut.patch)
    return mut
  }

  /**
   * Creates a new block on parent feed and dispatches it to store
   *
   * - branch {Feed} the parent feed, OPTIONAL! defaults to user's private feed.
   * - type {string} (block-type: 'profile' | 'box' | 'message')
   * - payload {object} The data contents
   * returns list of modified stores
   */
  async createBlock (branch, type, payload) {
    if (typeof branch === 'string') return this.createBlock(null, branch, type)
    this._checkReady() // Abort if not ready

    // Use provided branch or fetch user's feed
    // if that also fails then initialize a new empty Feed.
    branch = branch || (await this.feed()) || new Feed()

    const seq = (await this.seq()) + 1 // Increment block sequence
    const data = SimplePicoKernel.encodeBlock(type, seq, payload) // Pack data into string/buffer
    branch.append(data, this._secret) // Append data on selected branch

    const mut = await this.dispatch(branch, true) // Dispatch blocks
    if (!mut.length) throw new Error('createBlock() failed: rejected by store')
    return branch
  }

  /**
   * Forwards call to RPC,
   * spawns a stateless Pico-net wire
   */
  spawnWire () {
    return this.rpc.spawnWire()
  }

  /**
   * RPC: on Peer disconnect handler, override for custom behaviour
   */
  ondisconnect (peer) {
    // Stub
  }

  /**
   * RPC: on Peer connect handler, override for custom behaviour
   * (like a handshake or something.)
   * The "wire-end" received contains two useful functions:
   * wire.postMessage(data, replyExpected: boolean) // => Promise
   * and
   * wire.close() // disconnects the peer
   */
  async onconnect (node) {
    // Ask peer for blocks
    await this.rpc.query(node)
  }

  /**
   * RPC: when remote Peer asks us for blocks
   * override friendly.
   * Expected to return a Feed or array of Feeds
   */
  async onquery (params) {
    // We'll just send the entire repo for now *shrug*
    const feeds = []
    if (this.repo.allowDetached) { // listFeeds()
      const res = await this.repo.listFeeds()
      for (const { value: chainId } of res) {
        if (!Buffer.isBuffer(chainId)) {
          console.error('ChainId borked', chainId)
          continue
        }
        const feed = await this.repo.resolveFeed(chainId)
        feeds.push(feed)
      }
    } else { // listHeads()
      const heads = await this.repo.listHeads()
      for (const { key } of heads) {
        const f = await this.repo.loadHead(key)
        if (f) feeds.push(f)
      }
    }
    return feeds
  }

  /**
   * RPC: when blocks are received
   * we simply dispatch them to the store.
   * They're 'mutations' =)
   * Returns feed to be forwarded to all connected peers
   */
  async onblocks (feed) {
    const loudFail = false
    const mutated = await this.dispatch(feed, loudFail)
    return mutated.patch
  }

  // Handles orphaned blocks by asking network
  // for a sync-up
  async _networkResolveFeed (feed, loudFail) {
    // Except this is not how query works atm.
    // const remote = await this.rpc.query({ resolve: feed.first.parentSig })
    // if (!feed) return 0 // Give up
    // remote.merge(feed)
    // const mutated = await this.dispatch(remote, loudFail)
    // return !!mutated.length
  }

  $connections () { return this.rpc.$connections }

  async close () {
    for (const sink of this.rpc.hub._nodes) {
      this.rpc.hub.disconnect(sink)
    }
    await this.db.close()
  }

  /**
   * Convert Object to buffer
   */
  static encodeBlock (type, seq, payload) {
    return pack({
      ...payload,
      type,
      seq,
      date: new Date().getTime()
    })
  }

  /**
   * Converts buffer to Object
   */
  static decodeBlock (body) {
    return unpack(body)
  }

  /**
   * Returns block's type as a string
   */
  static typeOfBlock (body) {
    return SimplePicoKernel.decodeBlock(body).type
  }
}

module.exports = SimplePicoKernel
