# PICO-STACK

> Pico stack is a WEB3.0 framework

It allows you to build Progressive Web Apps that work completely without a server/backend/REST-API and without a central database.

> When you stash your entire Backend inside Frontend you get "Blockend".

I want to document and consolidate these components into a single easy to use module.

```js
import { Feed, Modem56, PicoStore } from 'picostack'
```

But for now (if you have the guts), refer to [PicoChat](https://github.com/telamon/picochat/) source, it serves as reference for this technology.


## core components

- [picofeed](https://github.com/telamon/picofeed) Ultra-portable secure feed/chain-of-blocks
- [picorepo](https://github.com/telamon/picorepo) Lightweight persistent block store ontop of leveldb/leveljs.
- [picostore](https://github.com/telamon/picostore) Redux-like state machine.
- [piconet](https://github.com/telamon/piconet) Internet Protocol redesigned for P2P, provides a stateless and easy to use alternative to network streams.
- [Modem56](https://github.com/telamon/picochat/blob/master/modem56.js) hyperswarm wrapper providing pico-net streams instead of sockets.
- [nuro](https://github.com/telamon/picochat/blob/master/blockend/nuro.js) A pure functional approach to reactive store pattern, desig reactive neural pathways framework agnostic.


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
