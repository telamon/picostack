const hyperswarm = require('hyperswarm-web')
const ProtoStream = require('hypercore-protocol')
const crypto = require('crypto')
const { hyperWire } = require('piconet')
const D = require('debug')('modem56')
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
class Modem56 {
  // Allow injection of a swarm instance,
  // Modules known to export a compatible interface:
  // - hyperswarm
  // - hyperswarm-web
  // - hyper-simulator
  constructor (swarm = null, swarmOpts) {
    D('[Modem56] Brrrrrr.. ptong ptong ptong ptong *whitenoise*')
    this.swarm = swarm || hyperswarm(swarmOpts)
    // Initial release support only 1 topic due to design limitations
    this._topic = null
    this._spawnWire = null
    this._onconnection = this._onconnection.bind(this)
  }

  join (topic, spawnWire) {
    if (this._topic) {
      // this.leave()
      // don't wanna have multi-topic support yet
      // so we'll just update the spawnWire ref and call it a day :D
      this._spawnWire = spawnWire || this._spawnWire
      return
    }
    if (typeof topic === 'string') {
      topic = crypto.createHash('sha256')
        .update(topic)
        .digest()
    }
    this.swarm.join(topic)
    this._spawnWire = spawnWire
    this._topic = topic
    this.swarm.on('connection', this._onconnection)
    this.swarm.on('error', err => console.error('[Modem56] swarm error: ', err.message))
    return () => this.leave()
  }

  _onconnection (socket, details) {
    D('[Modem56] peer connected', details)
    const { client } = details
    const hyperProtocolStream = new ProtoStream(client)
    socket.pipe(hyperProtocolStream).pipe(socket)
    hyperProtocolStream.on('error', err => console.error('[Modem56] hyper-proto error: ', err.message))
    socket.on('error', err => console.error('[Modem56] socket error: ', err.message))
    const encryptionKey = this._topic
    const plug = this._spawnWire(details)
    hyperWire(plug, hyperProtocolStream, encryptionKey)
  }

  leave () {
    this.swarm.leave(this._topic)
    this.swarm.off('connection', this._onconnection)
    this.swarm.off('error')
    this._topic = null
  }
}

module.exports = Modem56
