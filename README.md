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


