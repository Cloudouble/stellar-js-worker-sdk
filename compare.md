# Comparison of JavaScript SDKs

This document will provide a quick comparison of coding styles between the two JavaScript Stellar SDKs - the existing [JS Stellar SDK](https://github.com/stellar/js-stellar-sdk) and this ***new*** [Stellar JS Worker SDK](https://github.com/Cloudouble/stellar-js-worker-sdk).

The code examples will be drawn from the examples found in the [JS Stellar SDK](https://github.com/stellar/js-stellar-sdk) documentation, and reproduces the same functionality using the [Stellar JS Worker SDK](https://github.com/Cloudouble/stellar-js-worker-sdk).

**Two demo pages are available to interact with the JS Worker SDK**, these demo pages also contain generated code snippets to help you learn the SDK:  

* *Read-Only Test of Horizon API*: https://stellar-js-worker-sdk.pages.dev/demos/horizon
* *Transaction Submission Test Using Horizon API*: https://stellar-js-worker-sdk.pages.dev/demos/horizon-submit

## SDK Footprint

The existing JS Stellar SDK has a browser footprint of 181kB (using this version https://cdn.jsdelivr.net/npm/@stellar/stellar-sdk@12.0.0-rc.2/dist/stellar-sdk.min.js). The browser network tab details a 181kB transfer size, with a total resource size of 811kB.

The new Stellar JS Worker SDK has a browser footprint of 3.5kB (using this version https://cdn.jsdelivr.net/gh/cloudouble/stellar-js-worker-sdk@latest/horizon.min.js) when initially loaded. The browser network tab details a 3.5kB transfer size, with a total resource size of 7.5kB. This is all that is required if only using the read-only functionality. 

Only when the `submit()` method is called for the first time (to create new transactions) does the JS Worker SDK load additional resources, which then brings the total SDK footprint up to 60kB in transfer size and up to 80kB in total resource size, depending on the execution environment. These additional resources can be optionally preloaded at any time if required to remove any delay when submitting a first transaction.

This is a significant reduction in the browser footprint, and helps in the effort to create snappy user experiences where end-users are likely to want to see information immediate, but will be more tolerant of longer waiting times when submitting new transactions. The once-only loading delay for the inital `submit()` transaction will typically be more shorter than the actual time for Stellar to respond anyway, so the end-user will never notice any delay beyond what built-in to the Stellar network.

## Cloudflare Worker Support

The existing JS Stellar SDK requires some tweaking to support Cloudflare Workers, see the *Usage with Cloudflare Workers* section of the [JS Stellar SDK](https://stellar.github.io/js-stellar-sdk/) documentation for more details.

**The new JS Worker SDK supports Cloudflare Workers out of the box for reading**, and only requires pre-loading of additional resources for submitting transactions. See the working example at https://github.com/Cloudouble/stellar-js-worker-sdk/blob/main/demos/cloudflare/worker.js which includes the lines for pre-loading required for the `submit()` method to work.

## Code Example: Querying Horizon

### JS Stellar SDK (Existing)

```
var StellarSdk = require('@stellar/stellar-sdk');
var server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');
// get a list of transactions that occurred in ledger 1400
server.transactions()
    .forLedger(1400)
    .call().then(function(r){ console.log(r); });

// get a list of transactions submitted by a particular account
server.transactions()
    .forAccount('GASOCNHNNLYFNMDJYQ3XFMI7BYHIOCFW3GJEOWRPEGK2TDPGTG2E5EDW')
    .call().then(function(r){ console.log(r); });
```

### Stellar JS Worker SDK (New)

```
import { horizon } from 'https://cdn.jsdelivr.net/gh/cloudouble/stellar-js-worker-sdk@latest/horizon.min.js?network=test'

// get a list of transactions that occurred in ledger 1400
const r = await horizon.get.ledgers(1400, "transactions")

// get a list of transactions submitted by a particular account
const r = await horizon.get.accounts("GASOCNHNNLYFNMDJYQ3XFMI7BYHIOCFW3GJEOWRPEGK2TDPGTG2E5EDW", "transactions")
```

## Code Example: Streaming Requests

### JS Stellar SDK (Existing)

```
var StellarSdk = require('@stellar/stellar-sdk')
var server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');
var lastCursor=0; // or load where you left off

var txHandler = function (txResponse) {
    console.log(txResponse);
};

var es = server.transactions()
    .forAccount(accountAddress)
    .cursor(lastCursor)
    .stream({
        onmessage: txHandler
    })
```

### Stellar JS Worker SDK (New)

```
import { horizon } from 'https://cdn.jsdelivr.net/gh/cloudouble/stellar-js-worker-sdk@latest/horizon.min.js?network=test'
const lastCursor=0; // or load where you left off

const {listener: transactions} = await horizon.listen.accounts(accountAddress, "transactions", {cursor: lastCursor})
transactions.addEventListener('message', event => console.log(event.data))

```

## Code Example: Auto-paginate Results

### Stellar JS Worker SDK (New)

```
import { horizon } from 'https://cdn.jsdelivr.net/gh/cloudouble/stellar-js-worker-sdk@latest/horizon.min.js?network=test'

for await (const transaction of horizon.stream.accounts(accountAddress, "transactions")) { 
    console.log(transaction)
    // it will continue to fetch transactions automatically (in batches) until the loop is exited with a `break`
}
```

## Submitting Transactions

### JS Stellar SDK (Existing)

Based on the example in the [Send and Receive Payments](https://developers.stellar.org/docs/tutorials/send-and-receive-payments) documentation, simplified to remove error checking to make these examples as direct a comparison as possible: 

```
var StellarSdk = require("stellar-sdk");
var server = new StellarSdk.Horizon.Server("https://horizon-testnet.stellar.org");
var sourceKeys = StellarSdk.Keypair.fromSecret("S...");
var destinationId = "G...";
var transaction;

const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: StellarSdk.Networks.TESTNET,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: destinationId,
          asset: StellarSdk.Asset.native(),
          amount: "10",
        }),
      )
      .addMemo(StellarSdk.Memo.text("Test Transaction"))
      .setTimeout(180)
      .build();

transaction.sign(sourceKeys);

const result = await server.submitTransaction(transaction);

```


### Stellar JS Worker SDK (New)

```
import { horizon } from 'https://cdn.jsdelivr.net/gh/cloudouble/stellar-js-worker-sdk@latest/horizon.min.js?network=test'

const secretKey = 'S...'
const transaction = {
    sourceAccount: 'G...',
    fee: 100, 
    memo: 'Test Transaction', 
    operations: [{
        type: 'PAYMENT',
        op: { destination: 'G...', asset: 'XLM', amount: 10 }
    }]
}
const { result } = await horizon.submit(transaction, secretKey)

```

The fact that transactions are inputted into the `submit()` method as plain objects makes it trivial to load transactions via JSON or other generic formats with minimal code required to make them suitable for use by the SDK. 

For live examples on how to format the input transaction, see the demo page at [Transaction Submission Test Using Horizon API](https://stellar-js-worker-sdk.pages.dev/demos/horizon-submit)


## XDR

A companion dedicated XDR parser and serializer library ([SimpleXDR](https://github.com/Cloudouble/simple-xdr)) has been developed to be used alongside and by the JS Worker SDK, it is available at https://github.com/Cloudouble/simple-xdr . However, you do not need to know anything about this library to use the JS Worker SDK, and the JS Worker SDK includes SimpleXDR automatically when required.
