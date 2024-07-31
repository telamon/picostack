// const hyperswarm = require('hyperswarm-web')
// import ProtoStream from 'hypercore-protocol'
import { streamWire } from 'piconet'
import { s2b, toU8, au8, toHex } from 'picofeed'
// const D = require('debug')('modem56')
const D = (...args) => console.info('modem56', ...args)

export async function hash (buffer, algo = 'sha-256') {
  return toU8(await globalThis.crypto.subtle.digest(algo, au8(buffer)))
}
/*
 *  It's **beep** time!
 *     ~¤~
 *   ___|_
 *  /____/|  ~ Modem 56 ~
 * |_o_=_|/
 *
 * Experimental! (pure digital anarchy)
 * Code scavenged from PoH in an attempt to make it easy to connect
 * to a swarm and use the piconet-hyperwire protocol.
 */
export class Modem56 {
  // Allow injection of a swarm instance,
  // Modules on npm known to export a compatible interface:
  // - hyperswarm
  // - hyperswarm-web
  // - hyper-simulator
  constructor (Swarm = null, swarmOpts) {
    D('[Modem56] Brrrrrr.. ptong ptong ptong ptong *whitenoise*')
    this.swarm = new Swarm(swarmOpts) // || hyperswarm(swarmOpts)
    // Initial release support only 1 topic due to design limitations
    this._topic = null
    this._spawnWire = null
    this._onconnection = this._onconnection.bind(this)
    this.swarm.on('update', () => D('update', this.swarm.connecting)) // , this.swarm.connections))
    this.swarm.on('error', err => console.error('[Modem56] swarm error: ', err.message))
  }

  async join (topic, spawnWire, noWaitFlush = false) {
    if (this._topic) {
      // this.leave()
      // don't wanna have multi-topic support yet
      // so we'll just update the spawnWire ref and call it a day :D
      this._spawnWire = spawnWire || this._spawnWire
      return
    }
    if (typeof topic === 'string') {
      topic = await hash(s2b(topic))
    }
    D('Joining topic', toHex(topic))
    this._spawnWire = spawnWire
    this._topic = topic
    this.swarm.on('connection', this._onconnection)
    const discovery = this.swarm.join(topic)
    if (!noWaitFlush) await discovery.flushed()
    return () => this.leave()
  }

  _onconnection (socket, details) {
    D('[Modem56] peer connected', details)
    const plug = this._spawnWire(details)
    socket.on('error', err => console.error('[Modem56] socket error: ', err.message))
    // socket is nowadays pre-encrypted?
    streamWire(plug, socket)
    // const hyperProtocolStream = new ProtoStream(client) // ProtoStream is dead
    // socket.pipe(hyperProtocolStream).pipe(socket)
    // hyperProtocolStream.on('error', err => console.error('[Modem56] hyper-proto error: ', err.message))
    // const encryptionKey = this._topic
    // hyperWire(plug, hyperProtocolStream, encryptionKey)
  }

  leave () {
    this.swarm.leave(this._topic)
    this.swarm.off('connection', this._onconnection)
    this._topic = null
    this._spawnWire = null
  }
}
