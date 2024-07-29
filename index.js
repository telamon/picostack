// SPDX-License-Identifier: AGPL-3.0-or-later
// export * from 'picofeed'
export { Memory, DiffMemory } from '@telamon/picostore'
export * from './simple-kernel.js'
export * from './simple-rpc.js'
export { Repo } from 'picorepo'
// export * as n from 'piconuro'
// export { Hub } from 'piconet'

/**
 * Attempted to flatten dependency tree
 * by setting all sub-module deps as peer-deps
 * and using this package as final version control.
 */
