# stellar-js-sdk
A lightweight JavaScript SDK for Stellar

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

While to use the Anchor API (possible future inclusion), you would import the `anchor` module: 

```
import { anchor } from './anchor.js'
```

Also, given that the code weight for reading from the API is much lighter than writing to the API, the module for writing to API is only loaded when it is first used. Thus if you call: 

```
horizon.send(myTransaction)
```

Only then will the more weighty `xdr.js` module be loaded into the SDK. 

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

