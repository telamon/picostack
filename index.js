// SPDX-License-Identifier: AGPL-3.0-or-later
import { Feed } from 'picofeed'
import Store from '@telamon/picostore'
import Hub from 'piconet'
import SimpleKernel from './simple-kernel.js'
import SimpleRPC from './simple-rpc.js'
import { Repo } from 'picorepo'
const { decodeBlock, encodeBlock } = SimpleKernel
import * as n from 'piconuro'

/**
 * Attempted to flatten dependency tree
 * by setting all sub-module deps as peer-deps
 * and using this package as final version control.
 */
export {
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
