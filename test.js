const test = require('tape')
const {
  Feed,
  Hub,
  Store,
  SimpleKernel,
  SimpleRPC
} = require('.')
test('Exports something', t => {
  t.ok(Feed)
  t.ok(Hub)
  t.ok(Store)
  t.ok(SimpleKernel)
  t.ok(SimpleRPC)
  t.end()
})
