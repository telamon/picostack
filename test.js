const test = require('tape')
const levelup = require('levelup')
const memdown = require('memdown')
const { get, until, next } = require('piconuro')
const {
  Feed,
  Hub,
  Store,
  SimpleKernel,
  SimpleRPC
} = require('.')
const DB = () => levelup(memdown())

test('Exports something', t => {
  t.ok(Feed)
  t.ok(Hub)
  t.ok(Store)
  t.ok(SimpleKernel)
  t.ok(SimpleRPC)
  t.end()
})

test('SimpleKernel.$connections neuron', async t => {
  const a = new SimpleKernel(DB())
  const b = new SimpleKernel(DB())
  let c = get(a.$connections())
  t.equal(c.length, 0, 'No connections')
  const plug = a.spawnWire()
  plug.open(b.spawnWire())
  await until(a.$connections(), v => v.length === 1)
  t.pass('Subscription fired')
  c = get(a.$connections()) // test sync value
  t.equal(c.length, 1, 'One connection')
  plug.close() // Errors logged here are due to disrupted handshake
  c = await until(a.$connections(), v => v.length === 0)
  t.pass('Subscription fired')
  t.equal(c.length, 0, 'Zero connections')
})

test.skip('Prevent duplicate peer connections', async t => {
  const alice = new SimpleKernel(DB())
  const bob = new SimpleKernel(DB())
  const plug = alice.spawnWire()
  plug.open(bob.spawnWire())
  let ac = await until(alice.$connections(), v => v.length === 1)
  t.equal(ac.length, 1, 'Alice has 1 connection')
  // WebRTC dosen't support peer-deduping.
  alice.spawnWire().open(bob.spawnWire())
  bob.spawnWire().open(alice.spawnWire())
  ac = await next(alice.$connections(), 2)
  t.equal(ac.length, 1, 'redundant connections were dropped')
  plug.close()
  ac = await until(alice.$connections(), v => v.length === 0)
  t.equal(ac.length, 0, 'all connections dropped')
  alice.spawnWire().open(bob.spawnWire())
  ac = await until(alice.$connections(), v => v.length === 1)
  t.equal(ac.length, 1, 'Bob and alice reconnected')
})
