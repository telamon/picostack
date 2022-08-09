// SPDX-License-Identifier: AGPL-3.0-or-later
const Feed = require('picofeed')
const Store = require('@telamon/picostore')
const Hub = require('piconet')
const SimpleKernel = require('./simple-kernel')
const SimpleRPC = require('./simple-rpc')
const Repo = require('picorepo')
const { decodeBlock, encodeBlock } = SimpleKernel
const n = require('piconuro')

/**
 * Attempted to flatten dependency tree
 * by setting all sub-module deps as peer-deps
 * and using this package as final version control.
 *
 * Thus exporting all sub-modules here to let
 * application avoid dep management..
 * But require/import resolves to sub-mod deps anyway i think,
 * unecessary exports?
 * I don't know. help!
 */
module.exports = {
  // Necessary Exports
  Feed,
  SimpleKernel,
  decodeBlock,
  encodeBlock,
  n, // Nuro

  // Convenience exports
  Store,
  Hub,
  SimpleRPC,
  Repo
}
