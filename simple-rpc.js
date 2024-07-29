/**
 * This RPC has 2 remote procedures.
 * First is "blocks" which sends one-or-more feeds to remote peer.
 * Second is "query" which expects remote peer to respond with "blocks".
 * Feel free to copy and modify if you need something different. (AGPL)
 */
import Hub from 'piconet'
import { Feed, au8, cmp, hexdump, feedFrom } from 'picofeed'
import { encode, decode } from 'cborg'
import { write } from 'piconuro'

function randomBytes (n) {
  const b = new Uint8Array(n)
  globalThis.crypto.getRandomValues(b)
  return b
}

// Message Types
const OK = 0
const ERR = -1
const QUERY = 1
const BLOCKS = 2
const NODE_ID = 3

export class SimpleRPC {
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
            if (n.id && cmp(n.id, data)) {
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
    if (!feeds?.length) return sink(encodeMsg(OK))
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

function encodeMsg (type, obj) {
  let buffer = null
  switch (type) {
    case BLOCKS:
      if (!obj) throw new Error('Feed expected')
      obj = Feed.from(obj)
      buffer = new Uint8Array(obj.tail + 1)
      buffer.set(obj.buffer, 1)
      break

    // Serialize signals
    case ERR:
    case OK:
      buffer = new Uint8Array(1)
      break

    // Serialize msgencode messages
    case QUERY: {
      const data = encode(obj)
      buffer = new Uint8Array(data.length + 1)
      buffer.set(data, 1)
    } break

    case NODE_ID:
      buffer = new Uint8Array(8 + 1)
      buffer.set(obj, 1)
      break

    default:
      throw new Error('UnknownMessageType: ' + type)
  }
  buffer[0] = type
  return buffer
}

function typeOfMsg (buffer) {
  au8(buffer)
  return buffer[0]
}

function decodeMsg (buffer) {
  au8(buffer)
  const type = typeOfMsg(buffer)
  let data = null
  switch (type) {
    case BLOCKS:
      data = feedFrom(buffer.subarray(1), false)
      break

    // deserialize signals
    case OK:
      data = 'OK'
      break
    case ERR:
      data = 'ERROR'
      break

    // deserialize messages
    case QUERY:
      data = decode(buffer.subarray(1))
      break

    case NODE_ID:
      data = buffer.subarray(1, 9)
      break

    default:
      throw new Error('UnknownMessageType: ' + type)
  }
  return { type, data }
}
