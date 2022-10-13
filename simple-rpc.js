/**
 * This RPC has 2 remote procedure calls.
 * First is "blocks" which sends one-or-more feeds to remote peer.
 * Second is "query" which expects remote peer to respond with "blocks".
 * Feel free to copy and modify if you need something different. (AGPL)
 */
const Hub = require('piconet')
const Feed = require('picofeed')
const { pack, unpack } = require('msgpackr')
const { write } = require('piconuro')

// const { randomBytes } = require('crypto')
// TODO: is crypto.randomBytes() available in Browser?
const randomBytes = n => Buffer.from(
  Array.from(new Array(n))
    // Not very random, used to generate a node-id
    .map(_ => Math.floor(Math.random() * 256))
)

// Message Types
const OK = 0
const ERR = -1
const QUERY = 1
const BLOCKS = 2
const NODE_ID = 3

class SimpleRPC {
  /** Handlers spec:
   * {
   *    // When peer conects
   *    onconnect: send => { ... }
   *
   *    // When peer asks for blocks
   *    onquery: async query => { return Feed || Feeds[] }
   *
   *    // When blocks received from peer
   *    onblocks: async feed => { ... }
   *
   *    // When peer disconnects
   *    ondisconnect: peer => { ... }
   * }
   */
  constructor (handlers) {
    this.nodeId = randomBytes(8)
    this._controller = this._controller.bind(this)
    this.hub = new Hub(
      (...a) => this._controller(...a),
      (...a) => this._ondisconnect(...a)
    )
    this.handlers = handlers

    // Export connections neuron
    const [$n, set] = write([])
    this._setConnections = set
    this.$connections = $n
  }

  spawnWire () {
    // Internal 'onconnect'
    const plug = this.hub.createWire(hubEnd => {
      // Exchange node Id
      hubEnd.postMessage(encodeMsg(NODE_ID, this.nodeId), true)
        .then(([msg, reply]) => {
          if (decodeMsg(msg).type !== OK) return // dupe-peer, wire will close
          this._setConnections(Array.from(this.hub._nodes))
          // Exchange done, continue with application handshake
          return this.handlers.onconnect(hubEnd)
        })
        .catch(err => console.error('Handshake failed', err))
    })
    return plug
  }

  _ondisconnect (...a) {
    this._setConnections(Array.from(this.hub._nodes))
    this.handlers.ondisconnect(...a)
  }

  async _controller (node, msg, replyTo) {
    try {
      const { type, data } = decodeMsg(msg)
      switch (type) {
        // Download blocks
        case BLOCKS:
          for await (const blocks of this._downloadFeeds(msg, replyTo)) {
            const patch = await this.handlers.onblocks(blocks)
            // Gossip if our store accepted the blocks
            if (patch) {
              this.shareBlocks(patch, node) // second param prevents echo
                .catch(err => console.error('Gossip failed', err))
            }
          }
          break

        // Respond to queries
        case QUERY: {
          const feeds = await this.handlers.onquery(data)
          // Upload feeds to peer
          this._uploadFeeds(replyTo, feeds)
            .catch(err => console.error('Failed uploading blocks', err))
        } break

        case NODE_ID:
          // Prevent accidental duplicate peer connections
          for (const n of this.hub._nodes) {
            if (Buffer.isBuffer(n.id) && n.id.equals(data)) {
              // Ignore dupe-ack error handling as conection is about
              // to be killed anyway
              replyTo(encodeMsg(ERR))
              return node.close(new Error('DuplicatePeer')) // dedupe peers
            }
          }
          node.id = data
          await replyTo(encodeMsg(OK))
          break

        default:
          throw new Error(`Unknown message type: ${type}`)
      }
    } catch (err) {
      console.error('RPC:internal error', err)
    }
  }

  // Shares blocks to all connected peers
  async shareBlocks (feeds, filter) {
    console.log('shareBlocks()', feeds)
    if (Feed.isFeed(feeds)) feeds = [feeds]
    feeds = [...feeds]
    const first = feeds.shift()
    const iterator = this.hub.survey(encodeMsg(BLOCKS, first), !!feeds.length, filter)

    for await (const [msg, sink] of iterator) {
      if (!feeds.length) continue // one feed sent, that's it.
      if (typeOfMsg(msg) === OK && sink) {
        this._uploadFeeds(sink, feeds)
          .catch(err => console.error('Failed sending subsequent feeds', err))
      } else {
        console.warn('Remote rejected subsequent blocks', typeOfMsg(msg))
      }
    }
  }

  async query (node, params = {}) {
    const [msg, reply] = await node.postMessage(encodeMsg(QUERY, params), true)
    if (decodeMsg(msg).type === OK) return // Empty reply
    // Let the controller handle the rest
    this._controller(node, msg, reply)
  }

  // Recursively uploads feeds until array
  // is empty or aborted by remote peer
  _uploadFeeds (sink, feeds) {
    if (!feeds || !feeds.length) {
      return sink(encodeMsg(OK))
    }
    const remaining = [...feeds]
    const current = remaining.shift()
    return sink(encodeMsg(BLOCKS, current), !!remaining.length)
      .then(([msg, next]) => {
        if (!remaining.length) return // It's done
        if (!msg) return console.warn('Empty scope')
        if (typeOfMsg(msg) !== OK) return console.warn('Peer rejected subsequent blocks', typeOfMsg(msg))
        return this._uploadFeeds(next, remaining)
      })
  }

  async * _downloadFeeds (msg, sink) {
    let done = false
    while (!done) {
      done = true
      const { type, data } = decodeMsg(msg)
      if (type === BLOCKS) yield data
      else if (sink) {
        console.warn('Expected BLOCKS but got', type)
        await sink(encodeMsg(ERR), false)
        continue
      }
      if (!sink) continue // End of stream

      // Download one more feed
      // updating msg and sink then do another loop.
      const scope = await sink(encodeMsg(OK), true)
      msg = scope[0]
      sink = scope[1]
      done = false
    }
  }
}
module.exports = SimpleRPC

function encodeMsg (type, obj) {
  let buffer = null
  switch (type) {
    case BLOCKS:
      // TODO: Extend picofeed with official binary pickle support.
      if (!obj) throw new Error('Feed expected')
      obj = Feed.from(obj)
      buffer = Buffer.alloc(obj.tail + 1)
      obj.buf.copy(buffer, 1, 0, obj.tail)
      break

    // Serialize signals
    case ERR:
    case OK:
      buffer = Buffer.alloc(1)
      break

    // Serialize msgpack messages
    case QUERY: {
      const data = pack(obj)
      buffer = Buffer.alloc(data.length + 1)
      data.copy(buffer, 1)
    } break

    case NODE_ID:
      buffer = Buffer.alloc(8 + 1)
      obj.copy(buffer, 1)
      break

    default:
      throw new Error('UnknownMessageType: ' + type)
  }
  buffer[0] = type
  return buffer
}

function typeOfMsg (buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error('BufferExpected')
  return buffer[0]
}

function decodeMsg (buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error('BufferExpected')
  const type = typeOfMsg(buffer)
  let data = null
  switch (type) {
    case BLOCKS:
      // TODO: Feed.from(buffer) in picofeed
      data = new Feed()
      data.buf = buffer.slice(1)
      data.tail = buffer.length - 1
      break

    // deserialize signals
    case OK:
      data = 'OK'
      break
    case ERR:
      data = 'ERROR'
      break

    // deserialize msgpack messages
    case QUERY:
      data = unpack(buffer.slice(1))
      break

    case NODE_ID:
      data = buffer.slice(1, 9)
      break

    default:
      throw new Error('UnknownMessageType: ' + type)
  }
  return { type, data }
}
