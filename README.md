```
██████ ██  ████  █████
██  ██ ██ ██    ██   ██
██████ ██ ██    ██   ██ ██ STACK ██
██     ██ ██    ██   ██ Network Without
██     ██  ████  █████       Super Node
```

> Pico-stack is a WEB3.0 framework

It allows you to build Progressive Web Apps that work completely without a server/backend/REST-API and without a central database.

> If you stash your entire Backend inside Frontend you get "Blockend".

## core components

- [picofeed](https://github.com/telamon/picofeed) Ultra-portable secure feed/chain-of-blocks
- [picostore](https://github.com/telamon/picostore) Redux-like state machine.
- [piconet](https://github.com/telamon/piconet) Internet Protocol redesigned for P2P, provides a stateless and easy to use alternative to network streams.
- [Modem56](https://github.com/telamon/picochat/blob/master/modem56.js) hyperswarm to pico-net converter.
- [nuro](https://github.com/telamon/piconuro) A pure functional approach to reactive store pattern, design your own reactive neural pathways, completely framework agnostic.
- [HyperSimulator](https://github.com/telamon/hyper-simulator) Run dat/[hyper](https://hypercore-protocol.org/)-apps in an in-memory swarm and watch the chaos unfold.
- [picorepo](https://github.com/telamon/picorepo) Lightweight persistent block store ontop of leveldb/leveljs.

## Quickstart

Use the project template

```bash
npx degit telamon/picostack-seed-svelte my-project
```

Check the `README.md` in the generated folder for further help.

[picostack-seed-svelte](https://github.com/telamon/picostack-seed-svelte)

[live demo](https://pico-todo.surge.sh/)

## usage

I want to document and consolidate these components into a single easy to use module.

But for now (if you have the guts), refer to [PicoChat](https://github.com/telamon/picochat/) source, it serves as reference for this technology.

Here's the gist of an app that
has a single decentralized variable called `DecentTime`:

> **update** The Example below is a bit outdated, checkout the project template instead
> and the comments in [SimpleKernel](./simple-kernel.js)
> I think the next section is going to be replaced with simple-kernel docs and a consice example how to extend it.
> Modem56 docs are missing... check template/seed.. :(

```js
// blockend.js
import { SimpleKernel } from 'picostack'
import levelup from 'levelup'
import leveljs from 'level-js'

// Set up the app state handler / store
const DB = levelup(leveljs('myapp')) // Open IndexedDB
class Kernel extends SimpleKernel {
  constructor(db) {
    super(db)
    this.store.register(TimeReducer())
  }

  async createTimestamp () {
    await this.createBlock('TimeStamp', { time: Date.now() })
  }
}

export default new Kernel(DB)

// PicoStore is a virtual-computer that runs blocks as
// if they are lines of code.
// Accepted blocks modify the computer's internal state.
// The reducers acts as the 'brains'
// deciding which instructions to run.
// A.k.a. 'The Consensus'.
// Please don't PoW or I'll get really upset.
function TimeReducer () {
  return {
    name: 'DecentTime',
    filter ({ block, state }) {
      const v = JSON.parse(block.body)
      // Reject invalid blocks
      if (v > Date.now()) return 'Invalid block from the future'
      if (v < state) return 'Outdated block'

      // Accept valid blocks
      return false
    },
    reducer ({ block }) => {
      // Mutate state
      return JSON.parse(block.body)
    }
  }
}
```

And frontend:

```html
<!doctype html>
<body>
  <h1 id="the-value">Unknown</h1>
  <button id="the-button">Mutate</button>

  <script>
    import { store, mutate } from './blockend.js'

    // Subscribe to state of 'DecentTime' in store
    // and continiously update on change.
    store.on('DecentTime', value => {
      document.getElementById('the-value').text = value
    })

    // Button mutates 'DecentTime' to Date.now() when clicked
    // and broadcasts the new block across the network.
    document
      .getElementById('the-button')
      .on('click', async () => {
        await mutate(Date.now())
      })
  </script>
</body>
</html>
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
 |  - Say Hi! :) https://discord.gg/K5XjmZx        |
 |.________________________________________________|
```

## License

[AGPL-3.0-or-later](./LICENSE)

2022 © Tony Ivanov
