import { test, solo } from 'brittle'
import { MemoryLevel } from 'memory-level'
import { get, until, next, combine, nfo, mute } from 'piconuro'
import { Feed } from 'picofeed'
import { Memory, Engine as Store } from '@telamon/picostore'
import { Hub } from 'piconet'
import {
  SimpleKernel,
  SimpleRPC,
} from './index.js'

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
solo('Ordered blockstream', async t => {
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

test.skip('Swarm eventually reaches the same state', async t => {
  const size = 4
  const nBumps = 10
  const peers = []
  let plug = null
  for (let i = 0; i < size; i++) {
    const k = new CounterKernel(DB())
    await k.boot()
    if (plug) plug.open(k.spawnWire())
    plug = k.spawnWire()
    peers.push(k)
  }
  plug.close()
  await Promise.all(peers.map(async k => {
    for (let i = 0; i < nBumps + 1; i++) await k.bump(i)
  }))
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
  t.equal(res, target, 'Sum reached target')
  for (const k of peers) await k.close()
  t.pass('Closed')
  // Logic works but asynchronity leaks in this test,
  // takes 30s to complete after last tap
})

class CounterKernel extends SimpleKernel {
  constructor (db) {
    super(db)

    this.store.register('x', class extends Memory {
      initialValue = 0
      compute (state, { AUTHOR, payload, reject }) {
        console.log(AUTHOR.slice(0, 6), ':', state, '-->', payload)
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
