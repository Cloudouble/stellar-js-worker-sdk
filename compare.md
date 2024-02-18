# Comparison of JavaScript SDKs

This document will provide a quick comparison of coding styles between the two JavaScript Stellar SDKs - the existing [JS Stellar SDK](https://github.com/stellar/js-stellar-sdk) and the [Stellar JS Worker SDK](https://github.com/Cloudouble/stellar-js-worker-sdk).

The code examples will be drawn from the examples found in the [JS Stellar SDK](https://github.com/stellar/js-stellar-sdk), and attempt to reproduce the same functionality using the [Stellar JS Worker SDK](https://github.com/Cloudouble/stellar-js-worker-sdk).

**Note**: at the time of writing (February 2024) the JS Worker SDK is still in early development and lacks many features of the mature [JS Stellar SDK](https://github.com/stellar/js-stellar-sdk). This document will be updated as the JS Worker SDK matures. 

## Querying Horizon

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
import { horizon } from 'https://cdn.jsdelivr.net/gh/Cloudouble/stellar-js-worker-sdk/horizon.min.js?network=test'

// get a list of transactions that occurred in ledger 1400
const r = await horizon.get.ledgers(1400, "transactions")

// get a list of transactions submitted by a particular account
const r = await horizon.get.accounts("GASOCNHNNLYFNMDJYQ3XFMI7BYHIOCFW3GJEOWRPEGK2TDPGTG2E5EDW", "transactions")
```

## Streaming Requests

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
import { horizon } from 'https://cdn.jsdelivr.net/gh/Cloudouble/stellar-js-worker-sdk/horizon.min.js?network=test'
const lastCursor=0; // or load where you left off

const {listener: transactions} = horizon.listen.accounts(accountAddress, "transactions", {cursor: lastCursor})
transactions.addEventListener('message', event => console.log(event.data))

```

## XDR

As of mid-February 2024, the *Stellar JS Worker SDK* does not provide an XDR decoder/encoder, however this is next on the roadmap for the near future and should be added by around the end of February 2024.


## Submitting Transactions

As of mid-February 2024, the *Stellar JS Worker SDK* does not provide capacity to submit transactions (see XDR point above!), however this is next on the roadmap for right after XDR support is added. The anticipated syntax for submitting transactions will be as close as possible to: 

```
import { horizon } from 'https://cdn.jsdelivr.net/gh/Cloudouble/stellar-js-worker-sdk/horizon.min.js?network=test'

// code to get the value for the sending account, fee, and create an array of operation objects

cons transactionResult = await horizon.send({account, fee, operations})

```
