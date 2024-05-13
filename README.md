# stellar-js-worker-sdk
A lightweight JavaScript SDK for Stellar

## Getting Started

### Web Browser

```
import {horizon} from 'https://cdn.jsdelivr.net/gh/cloudouble/stellar-js-worker-sdk@latest/horizon.min.js'
```

This will load everything you need to use the SDK in a web browser, transaction write function will autoload when you call it.

See the code of the [demo pages](https://github.com/Cloudouble/stellar-js-worker-sdk/tree/main/demos) for a complete example of how to use the SDK in a web browser.


### Web Service Worker

```
import { horizon } from 'https://cdn.jsdelivr.net/gh/cloudouble/stellar-js-worker-sdk@latest/horizon.min.js'

// the following lines are only required if you will be using transaction write functions
import submit from 'https://cdn.jsdelivr.net/gh/cloudouble/stellar-js-worker-sdk@latest/utils/submit.min.js'
import xdr from 'https://cdn.jsdelivr.net/gh/cloudouble/simple-xdr@1.2.4/xdr.min.js'
import { signAsync } from 'https://cdn.jsdelivr.net/npm/@noble/ed25519@2.1.0/+esm'
horizon.utils._scopes.submit = !!Object.assign(horizon.utils, submit)
horizon.utils._scopes.xdr = !!(horizon.utils.xdr = xdr)
horizon.utils.ed25519 = { signAsync }
```

See the [demo code of the example Service Worker](https://github.com/Cloudouble/stellar-js-worker-sdk/blob/main/demos/sw.js). 

### Cloudflare Worker

```
const horizon = (await import('./include/stellar-js-worker-sdk/horizon.js')).horizon

// the following six lines are only required to support transaction submitting functionality
const submit = (await import('./include/stellar-js-worker-sdk/utils/submit.js')).default
const signAsync = (await import('./include/noble/ed25519.js')).signAsync
const xdr = (await import('./include/simple-xdr/xdr.js')).default
horizon['utils']._scopes.submit = !!Object.assign(horizon['utils'], submit)
horizon['utils'].ed25519 = { signAsync }
horizon['utils']._scopes.xdr = !!(horizon['utils'].xdr = xdr)
```

The above assumes that you put local copies of the SDK and supporting resources in a folder called `include` in the root of your project.

See the [demo code of the example Cloudflare Worker](https://github.com/Cloudouble/stellar-js-worker-sdk/blob/main/demos/cloudflare/worker.js)


## Technical Architecture

This SDK focuses on the following:

- **Compatibility with modern web standards**: including browser usage, service workers and popular JavaScript based backend platforms including Cloudflare Workers, Deno and Wasmer
- **Lightweight**: lazy loading to allow for use in high performance mobile web applications
- **Ease of use**: concise and intuitive syntax to lower the developer learning curve and reduce boilerplate code

## Modules

The SDK is organized with separate modules for each Stellar API, each module can be imported separately. 

For example, to use the Stellar Horizon API, you can import the `horizon` module:

```
import { horizon } from './horizon.js'
```

While to use the Anchor, Disbursement and Soroban RPC APIs (in planning), you would import the relevant modules as follows: 

```
import { anchor } from './anchor.js'
import { disbursement } from './disbursement.js'
import { soroban } from './soroban.js'
```

Also, given that the code weight for reading from the API is much lighter than writing to the API, the module for writing to API is only loaded when it is first used. Thus if you call: 

```
horizon.submit(transaction, secretKey)
```

Only then will the XDR helpers be loaded into the SDK. 

This allows for applications to load quickly for initial rendering of data read from the network, while still allowing developers transparent access to the write functions without thinking about the underlying implementation.

## Network Selection

To choose which network to use, specify the network name in the import URL: 

```
// connect to the public / production network
import { horizon } from './horizon.js'

// connect to the test network
import { horizon } from './horizon.js?network=test'

// connect to the future network
import { horizon } from './horizon.js?network=future'

// connect to a custom network
import { horizon } from './horizon.js?network=custom&endpoint=ENDPOINT&passphrase=PASSPHRASE'

```

## Refection of Horizon API endpoints

The SDK is designed to be as close to the Horizon API as possible. This means that the SDK will have the same endpoints as the Horizon itself, this allows for developers to intuitively understand how to use the SDK by simply reading the API documentation. 

For example: 

[Retrieve an account](https://developers.stellar.org/api/horizon/resources/retrieve-an-account) with: 

```
const myAccountRecord = await horizon.get.accounts(accountId)
```

This same pattern applies to all API endpoints, with the following patterns being universal as far as the underlying API allows. For example: 

```
const myTransaction = await horizon.get.transactions(transactionId)

const myAccountTransactions = await horizon.get.accounts(accountId, 'transactions')
const myFirstTenAccountTransactions = await horizon.get.accounts(accountId, 'transactions', {limit: 10, order: 'asc'})

const myOperation = await horizon.get.operations(operationId)
const myOperationEffects = await horizon.get.operations(operationId, 'effects')

```

## Auto Pagination using `stream`

The SDK also provides a `stream` endpoint to allow for auto pagination of API endpoints. This endpoint works on all API endpoints with the same semantics as the previous `get` endpoint.

We could re-write the examples above to use `stream` instead of `get`, in order to loop over each individual record instead of retrieving all at once: 

```
// this will loop over all found transactions until it reaches one with the `id` of "abc"
for await (const t of horizon.stream.transactions(accountId, 'transactions')) {
    console.log(t)
    if (t.id === 'abc') break
}

// loop over a single given operation if it exists
for await (const op of horizon.stream.operations(operationId)) {
    console.log(op)
}

// loop over all effects of a given operation
for await (const effect of horizon.stream.operations(operationId, 'effects')) {
    console.log(effect)
}

```

In all cases, the potential looping will continue until the complete record set is exhausted, and background requests will be made to capture each subsequent result page.


## Listening for New Records

The EventSource capabilities of the Horizon API are encapsulated just as easily: 

```
// Create an EventSource for the transactions endpoint, emitting the records as they are received
const { listener: transactions, abortController } = await horizon.listen.transactions()
transactions.addEventListener('message', event => console.log(event.data))

//when you want to stop listening, do this
abortController.abort()

// handle errors, including when the connection is closed prematurely
transactions.addEventListener('error', event => {
    //do something about the error
})

transactions.addEventListener('close', event => {
    // do something about the close, perhaps re-initialize the transactions listener
    abortController.abort()
    transactions = (await horizon.listen.transactions()).listener
    transactions.addEventListener('message', event => console.log(event.data))    
})

```

