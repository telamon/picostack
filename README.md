```
 _ __  (_)  ___  ___   ___ | |_  __ _   ___ | | __
| '_ \ | | / __|/ _ \ / __|| __|/ _` | / __|| |/ /
| |_) || || (__| (_) |\__ \| |_| (_| || (__ |   < 
| .__/ |_| \___|\___/ |___/ \__|\__,_| \___||_|\_\
|_|  network without super node
```

> If you stash your entire Backend inside Frontend you get "Blockend".

This is a toolkit to build p2p application cores, using emepheral states.  

Why do we need yet another consensus engine in 202x?  
Well this one provides a non-token based solution to decentralization _(and also it runs in frontend/-user device with finite resources)_.  

In a picosphere nothing is permanent, blocks dissapear, chains corrupt,
states across nodes differ - but all states are valid.  
In "bc"-terms picostack an intricate mempool giving you fine control over: computing states that "could be".


This kit exposes a higher level API to quickly design and test what ever consensus
you imagine.  
If you stumble on a local state that you wish to persist as truth, you can of course 
copy the picofeeds to what ever medium you like.  
Their format is binary and quite space-efficient.


**Update 2024**
After _a lot_ of iterations picostore 3.x is starting to emerge.  
In hindsight I would have liked to rename some components like `stack => core-kit` and `store => block-engine`,
it makes more sense.


### [[live demo]](https://pico-todo.surge.sh/)

## core components

- [picofeed](https://github.com/telamon/picofeed) Ultra-portable secure feed/chain-of-blocks
- [picostore](https://github.com/telamon/picostore) block engine w/ garbarge collector.
- [piconet](https://github.com/telamon/piconet) Internet Protocol redesigned for P2P, provides a stateless and easy to use alternative to network streams.
- [Modem56](https://github.com/telamon/picochat/blob/master/modem56.js) hyperswarm to pico-net converter.
- [nuro](https://github.com/telamon/piconuro) A pure functional approach to reactive store pattern, design your own reactive neural pathways, completely framework agnostic.
- [HyperSimulator](https://github.com/telamon/hyper-simulator) Run dat/[hyper](https://hypercore-protocol.org/)-apps in an in-memory swarm and watch the chaos unfold.
- [picorepo](https://github.com/telamon/picorepo) Lightweight persistent block store ontop of leveldb/leveljs.

## Quickstart

Use the [project template](https://github.com/telamon/pico-template):

```bash
npx degit telamon/pico-template my-project
```

Check the `README.md` in the generated folder.

## usage

Extend [`SimpleKernel`](./simple-kernel.js) when starting new.

```js
// blockend.js
import { SimpleKernel } from 'picostack'
const { decodeBlock } = SimpleKernel

class Kernel extends SimpleKernel {
  constructor(db) {
    super(db)

    // Register reducer - see picostore docs
    this.store.register({
      name: 'clock', // slice name
      initialValue: 0, // initial state
      filter ({ block }) { // network-consensus
        const { type, time } = decodeBlock(block.body)
        if (type !== 'tick') return true // silent ignore
        if (time > Date.now()) return 'TimestampFromFuture'
      },
      reducer ({ block }) { // mutate state
        const { time } = decodeBlock(block.body)
        return time
      }
    })
  }

  // Create action
  async createTick () {
    const feed = await this.createBlock(
      'tick', // BlockType:string
      { time: Date.now() } // Payload:any
    )
    return feed.last.sig // block-id
  }
}

async function main() {
  // Spawn 2 peers
  const alice = new Kernel(memdown())
  await alice.boot()

  const bob = new Kernel(memdown())
  await bob.boot()

  // Attach state-observers
  alice.store.on('clock', state => console.log('Alice:', state))
  bob.store.on('clock', state => console.log('Bob:', state))

  // Wire up
  alice.spawnWire()(bob.spawnWire())

  await alice.createTick()
  // Both kernels logs new state
}
main().catch(console.error)
```

## Ad

```ad
|  __ \   Help Wanted!     | | | |         | |
| |  | | ___  ___ ___ _ __ | |_| |     __ _| |__  ___   ___  ___
| |  | |/ _ \/ __/ _ \ '_ \| __| |    / _` | '_ \/ __| / __|/ _ \
| |__| |  __/ (_|  __/ | | | |_| |___| (_| | |_) \__ \_\__ \  __/
|_____/ \___|\___\___|_| |_|\__|______\__,_|_.__/|___(_)___/\___|

If you're reading this it means that the docs are missing or in a bad state.

Writing and maintaining friendly and useful documentation takes
effort and time.

  __How_to_Help____________________________________.
 |                                                 |
 |  - Open an issue if you have questions!         |
 |  - Star this repo if you found it interesting   |
 |  - Fork off & help document <3                  |
 |  - Say Hi! :) https://discord.gg/8RMRUPZ9RS     |
 |.________________________________________________|
```

## License

[AGPL-3.0-or-later](./LICENSE)

2022 © Tony Ivanov
