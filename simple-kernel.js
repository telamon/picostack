// Kernel includes
import { Repo } from 'picorepo'
import { Memory, Store } from '@telamon/picostore'
import { Feed, getPublicKey, s2b, toU8, feedFrom, au8 } from 'picofeed'
// import { encode, decode } from 'cborg'
import { SimpleRPC } from './simple-rpc.js'
const KEY_SK = s2b('reg/sk')

/**
 * @typedef {import('picofeed').SecretBin} SecretBin
 * @typedef {import('picofeed').PublicHex} PublicHex
 * @typedef {import('picorepo').BinaryLevel} BinaryLevel
 */

/* This is a simple but complete pico-kernel,
 * It sets up a user-identity, store and rpc.
 *
 * If you need something more advanced feel free to
 * fork off and hack. <3
 */
export class SimpleKernel {
  ready = false
  /** @type {null|SecretBin} */
  _secret = null
  /** @type {BinaryLevel} */
  db = null
  /** @type {Store} */
  store = null
  /** @type {SimpleRPC} */
  rpc = null

  /**
   * @param {BinaryLevel} db Datastore
   * @param {{ secret?: SecretBin }} opts Options
   */
  constructor (db, opts = {}) {
    // Setup store
    this.db = db
    this.repo = new Repo(db)
    this.store = new Store(this.repo, {
      strategy: this.mergeStrategy.bind(this)
    })
    this.store.tap(this._onstoreevent.bind(this))
    // this.store.mutexTimeout = 600000000
    this._secret = opts.secret ? toU8(opts.secret) : null

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
   * @returns {PublicHex}
   */
  get pk () {
    return getPublicKey(this._secret)
  }

  /**
   * Generates/Restores user _secret and initializes store
   * call boot after slice registrations and before
   * network connections/dispatch.
   */
  async boot () {
    if (this.__loading) return this.__loading
    /// Master Asynchr0nos was here
    this.__loading = (async () => {
      // If identity wasn't provided via opts.
      if (!this._secret) {
        try {
          // Attempt to restore existing identity
          this._secret = (await this.repo.readReg(KEY_SK) || null)
        } catch (err) {
          if (!err.notFound) throw err
        }
      }

      // Fallback to generate new identity
      if (!this._secret) {
        const { sk } = Feed.signPair()
        this._secret = au8(toU8(sk), 32)
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
   * @type {import('picorepo').MergeStrategy}
   */
  async mergeStrategy (block, repo) {
    return false
  }

  /**
   * Returns user's feed
   * @returns {Promise<Feed>}
   */
  async feed (limit = undefined) {
    this._checkReady()
    return this.repo.loadHead(this.pk, limit)
  }

  _checkReady () {
    if (!this.ready) throw new Error('Kernel not ready, did you await kernel.boot()?')
  }

  /**
   * Returns user's feed current blockheight
   */
  async seq () {
    return 0 // await this.feed(1).seq
    /* TODO: move to formal header
    const feed = await this.feed(1)
    if (!feed) return -1
    return decode(feed.last.body).seq
    */
  }

  /**
   * Mutates store and reduced state
   * returns {string[]} names of stores that were modified by this action
   */
  async dispatch (patch, loudFail = false) {
    this._checkReady()
    return await this.store.dispatch(patch, loudFail)
    // TODO: this.store.tap(observer) taps into merged blocks, but there are tradeoffs... let's weight them.
    // Transmit accepted blocks on all wires
    // if (patch?.length) this.rpc.shareBlocks(patch)
    // return patch
  }

  /** @type {(name: string) => Memory} */
  collection (name) {
    if (!(name in this.store.roots)) throw new Error(`No such collection: ${name}, did you register it?`)
    return this.store.roots[name]
  }

  /**
   * Creates a new block on parent feed and dispatches it to store
   *
   * @param {string} root Name of store-collection
   * @param {object} payload Block contents
   * @param {Feed} [branch] Target feed, defaults to user's private feed.
   * @returns {Promise<Feed>} patch
   */
  async createBlock (root, payload, branch) {
    this._checkReady() // Abort if not ready

    // Use provided branch or fetch user's feed
    // if that also fails then initialize a new empty Feed.
    branch = branch || (await this.feed()) || new Feed()

    // TODO: Move SEQ as an optional builtin feature in picofeed
    // const seq = (await this.seq()) + 1 // Increment block sequence
    const patch = await this.collection(root).createBlock(branch, payload, this._secret)
    return patch
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
  async onquery (params, reply) {
    // We'll just send the entire repo for now *shrug*
    const feeds = []
    if (this.repo.allowDetached) { // listFeeds()
      const res = await this.repo.listFeeds()
      for (const { value: chainId } of res) {
        try { au8(chainId, 64) } catch {
          console.error('ChainId borked', chainId)
          continue
        }
        const feed = await this.repo.resolveFeed(chainId)
        feeds.push(feed)
      }
    } else { // listHeads()
      const heads = await this.repo.listHeads()
      for (const { key } of heads) {
        const f = await this.repo.loadHead(toU8(key))
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
    const patch = await this.dispatch(feed, loudFail)
    return patch
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
   * @deprecated,
   * Returns block's type as a string
  static typeOfBlock (body) {
    return decode(body).type
  }
   */

  /**
   * Recieves events such as change|merged
   * We simply take all 'merged' blocks and forward them onto
   * the wire.
   * @type {(event: string, payload: any) => void}
   */
  _onstoreevent (event, payload) {
    // console.info(event, payload)
    /*
     * BIG TODO: store has store._onunlock array, which should
     * be used to buffer all events during locked state and
     * then dump all accepted blocks as a batch onto the wire.
     */
    // Major bottleneck/ slowdown
    if (event === 'merged') this.rpc.shareBlocks(feedFrom(payload.block))
  }
}
