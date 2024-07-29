// import wtf from 'wtfnode'
import { test } from 'brittle'
import { MemoryLevel } from 'memory-level'
import { get, until, next, combine, nfo, mute } from 'piconuro'
import { Feed } from 'picofeed'
import { Memory, Store } from '@telamon/picostore'
import { Hub } from 'piconet'
import {
  SimpleKernel,
  SimpleRPC
} from './index.js'
import { performance, PerformanceObserver } from 'node:perf_hooks'
import { webcrypto } from 'node:crypto'
// shim for test.js and node processes
if (!globalThis.crypto) globalThis.crypto = webcrypto

const DB = () => new MemoryLevel({
  valueEncoding: 'view',
  keyEncoding: 'view'
})

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
  await a.boot()
  await b.boot()
  let c = get(a.$connections())
  t.is(c.length, 0, 'No connections')
  const plug = a.spawnWire()
  plug.open(b.spawnWire())
  await until(a.$connections(), v => v.length === 1)
  t.pass('Subscription fired')
  c = get(a.$connections()) // test sync value
  t.is(c.length, 1, 'One connection')
  plug.close() // Errors logged here are due to disrupted handshake
  c = await until(a.$connections(), v => v.length === 0)
  t.pass('Subscription fired')
  t.is(c.length, 0, 'Zero connections')
})

test('Prevent duplicate peer connections', async t => {
  const alice = new SimpleKernel(DB())
  const bob = new SimpleKernel(DB())
  const plug = alice.spawnWire()
  plug.open(bob.spawnWire())
  let ac = await until(alice.$connections(), v => v.length === 1)
  t.is(ac.length, 1, 'Alice has 1 connection')
  // WebRTC dosen't support peer-deduping.
  alice.spawnWire().open(bob.spawnWire())
  bob.spawnWire().open(alice.spawnWire())
  ac = await next(alice.$connections(), 2)
  t.is(ac.length, 1, 'redundant connections were dropped')
  plug.close()
  ac = await until(alice.$connections(), v => v.length === 0)
  t.is(ac.length, 0, 'all connections dropped')
  alice.spawnWire().open(bob.spawnWire())
  ac = await until(alice.$connections(), v => v.length === 1)
  t.is(ac.length, 1, 'Bob and alice reconnected')
})

// Prevent racing condition when one end generates blocks too fast.
test('Ordered blockstream', async t => {
  const alice = new CounterKernel(DB())
  const bob = new CounterKernel(DB())
  await alice.boot()
  await bob.boot()
  const plug = alice.spawnWire()

  await alice.bump(1)
  await bob.bump(1)

  plug.open(bob.spawnWire())

  await alice.bump(2)
  await alice.bump(4)
  await bob.bump(3)
  await bob.bump(5)
  await bob.bump(7)

  const ax = await next(s => alice.store.on('x', s), 1)
  const bx = await next(s => bob.store.on('x', s), 0)
  t.alike(ax, bx)
})

test('Swarm eventually reaches the same state', async t => {
  // TODO: this is a good test to use for benchmarking
  // Pico-stack is slow as snails atm,
  // also design an distributed vector clock using hyper/autobase for comparison
  const obs = new PerformanceObserver(items => {
    console.log('perf:', items.getEntries())
    // performance.clearMarks()
    // performance.clearMeasures()
  })
  obs.observe({ type: 'measure' })

  const size = 4
  const nBumps = 10
  const peers = []
  let plug = null
  performance.mark('init')
  // All nodes are connected in series
  // e.g. there is 9 hops between first and last node in a network of 10
  for (let i = 0; i < size; i++) {
    const k = new CounterKernel(DB())
    await k.boot()
    if (plug) plug.open(k.spawnWire())
    plug = k.spawnWire()
    peers.push(k)
  }
  performance.measure('Object Initialization', 'init')
  plug.close() // close last dangling plug?
  // plug.open(peers[0].spawnWire()) // connect last to first/circle network
  performance.mark('block_init')
  await Promise.all(peers.map(async k => {
    for (let i = 1; i < nBumps + 1; i++) await k.bump(i)
  }))
  performance.measure('All blocks generated', 'block_init')
  // setTimeout(() => process.exit(0), 150)
  t.pass('Bumps finished')
  const target = size * size * nBumps
  const $X = nfo(combine(peers.map(p => p.$x())))
  const $version = mute($X, v =>
    Object.values(v).reduce((sum, node) =>
      sum + Object.values(node).reduce((s, n) =>
        s + n, 0
      ), 0
    )
  )
  const res = await until($version, v => v === target)
  performance.measure('Convergence Reached', 'block_init')
  t.is(res, target, 'Sum reached target')
  for (const k of peers) await k.halt()
  t.pass('All peers halted')
  // Logic works but asynchronity leaks in this test,
  // takes 30s to complete after last tap
  // edit: It's not a leak, it's expected behaviour
  // but i think the delay is due to store lock-queue that is still processing.
  // Done! ~~fix 1: Determine already-have blocks without aquiring write-lock~~
  // fix 2: Don't echo back merged blocks to source
  // edit2: It's a leak...
  // wtf.dump()
  // edit3: leak fixed!
})

class CounterKernel extends SimpleKernel {
  constructor (db) {
    super(db)
    this.store.register('x', class extends Memory {
      initialValue = 0
      compute (state, { AUTHOR, payload, reject }) {
        // console.log(AUTHOR.slice(0, 6), ':', state, '-->', payload)
        if (state >= payload) return reject('must increment')
        return payload
      }
    })
  }

  $x () { return s => this.store.on('x', s) }

  async bump (x) {
    const f = await this.createBlock('x', x)
    return f.last.id
  }
}

// eslint-disable-next-line no-unused-vars
async function dump (repo, file) {
  return require('picorepo/dot')
    .dump(repo, file, {
      blockLabel: block => SimpleKernel.decodeBlock(block.body).x
    })
}
