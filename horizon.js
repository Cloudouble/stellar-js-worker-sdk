const metaOptions = (new URL(import.meta.url)).searchParams, networks = {
    futurenet: { endpoint: 'https://horizon-futurenet.stellar.org', passphrase: 'Test SDF Future Network ; October 2022' },
    test: { endpoint: 'https://horizon-testnet.stellar.org', passphrase: 'Test SDF Network ; September 2015' },
    custom: { endpoint: metaOptions.get('endpoint'), passphrase: metaOptions.get('passphrase') }
}

const horizon = Object.defineProperties({}, {
    network: {
        enumerable: true, writable: true,
        value: networks[metaOptions.get('network')] ?? { endpoint: 'https://horizon.stellar.org', passphrase: 'Public Global Stellar Network ; September 2015' },
    },
    _get: {
        value: async function (resourceType, resourceId, scope, params = {}, fromStream = false) {
            if (!(resourceType in this._types)) throw new RangeError(`Invalid resource type: ${resourceType}, must be one of ${JSON.stringify(Object.keys(this._types))}`)
            const headers = { Accept: 'application/json' }
            let result, cause, response
            if (!resourceId) result = await fetch(`${this.network.endpoint}/${resourceType}?${new URLSearchParams(params)}`, { headers })
                .then(r => { response = r; return r.json() }).catch(err => cause = err)
            if (!result && !scope) result = await fetch(`${this.network.endpoint}/${resourceType}/${resourceId}`, { headers })
                .then(r => { response = r; return r.json() }).catch(err => cause = err)
            if (!result && !this._types[resourceType]) return
            if (!result && !this._types[resourceType].includes(scope)) throw new RangeError(`Invalid scope when resourcetype is ${resourceType}: must be one of ${JSON.stringify(this._types[resourceType])}`)
            result ||= await fetch(`${this.network.endpoint}/${resourceType}/${resourceId}/${scope}?${new URLSearchParams(params)}`, { headers })
                .then(r => { response = r; return r.json() }).catch(err => cause = err)
            if (cause || !response.ok) throw new Error(
                `Network request fetch failed for resourceType: ${resourceType}, resourceId: ${resourceId}, scope: ${scope}, params: ${params ? JSON.stringify(params) : 'undefined'}: ${cause ?? [response.status, response.statusText].join(': ')}`, { cause: cause ?? response })
            if (fromStream) return result._embedded?.records ?? [result]
            return result._embedded ? result._embedded.records : result
        }
    },
    _listen: {
        value: function (resourceType, resourceId, scope) {
            if (!(resourceType in this._types)) throw new RangeError(`Invalid resource type: ${resourceType}, must be one of ${JSON.stringify(Object.keys(this._types))}`)
            const url = resourceId
                ? (scope ? `${this.network.endpoint}/${resourceType}/${resourceId}/${scope}` : `${this.network.endpoint}/${resourceType}/${resourceId}`)
                : `${this.network.endpoint}/${resourceType}`, abortController = new AbortController(),
                signal = abortController.signal, listener = new EventTarget()
            let eventSource
            try {
                eventSource = new EventSource(url)
            } catch (e) {
                throw new Error(`Event source creation failed for resourceType: ${resourceType}, resourceId: ${resourceId}, scope: ${scope}: ${e}`, { cause: e })
            }
            let hasOpened
            return new Promise((resolve, reject) => {
                eventSource.addEventListener('message', event => {
                    const { data, origin, lastEventId, source, ports } = event
                    listener.dispatchEvent(new MessageEvent('message', { data, origin, lastEventId, source, ports }))
                }, { signal })
                eventSource.addEventListener('open', event => {
                    hasOpened = true
                    resolve({ listener, abortController, eventSource })
                }, { signal })
                eventSource.addEventListener('error', event => {
                    hasOpened ? listener.dispatchEvent(new CustomEvent('error', { detail: event })) : reject()
                }, { signal })
            })
        }
    },
    _stream: {
        value: async function* (resourceType, resourceId, scope, params = {}) {
            if (!(resourceType in this._types)) throw new RangeError(`Invalid resource type: ${resourceType}, must be one of ${JSON.stringify(Object.keys(this._types))}`)
            let page, pageOrigLength, isLastPage, pagingToken
            try {
                page = await this._get(resourceType, resourceId, scope, params, true)
                pageOrigLength = page.length
                isLastPage = pageOrigLength < (params?.limit ?? 10)
            } catch (e) {
                throw new Error(e.message, { cause: e })
            }
            while (page.length) {
                const record = await page.shift()
                if (!record) break
                pagingToken = record.paging_token
                delete record.paging_token
                yield record
                if (!page.length && !isLastPage && pagingToken && (params && (typeof params === 'object'))) {
                    params.cursor = pagingToken
                    try {
                        page = await this._get(resourceType, resourceId, scope, params, true)
                    } catch (e) {
                        throw new Error(e.message, { cause: e })
                    }
                    pageOrigLength = page.length
                    isLastPage = pageOrigLength < (params?.limit ?? 10)
                }
            }
        }
    },
    _types: {
        value: {
            accounts: ['transactions', 'operations', 'payments', 'effects', 'offers', 'trades'],
            assets: null,
            claimable_balances: ['transactions', 'operations'],
            effects: null,
            ledgers: ['transactions', 'payments', 'operations', 'effects'],
            liquidity_pools: ['effects', 'trades', 'transactions', 'operations'],
            offers: ['trades'],
            operations: ['effects'],
            payments: null,
            trades: null,
            transactions: ['operations', 'effects'],
            order_book: null,
            paths: ['strict-receive', 'strict-send'],
            trade_aggregations: null,
            fee_stats: null
        }
    },
    get: {
        enumerable: true,
        value: {}
    },
    stream: {
        enumerable: true,
        value: {}
    },
    listen: {
        enumerable: true,
        value: {}
    },
    data: {
        enumerable: true,
        value: async function (accountId, key) {
            if (!accountId) throw new TypeError(`Invalid accountId: ${accountId}`)
            if (!key) throw new TypeError(`Invalid key: ${key}`)
            let result, cause, response
            result = (await fetch(`${this.network.endpoint}/accounts/${accountId}/data/${key}`, { headers: { Accept: "application/json" } })
                .then(r => { response = r; return r.json() }).catch(err => cause = err))?.value
            if (cause || !response.ok) throw new Error(
                `Network request fetch failed for accountId: ${accountId}, key: ${key}: ${cause ?? [response.status, response.statusText].join(': ')}`, { cause: cause ?? response })
            return result
        }
    },
    send: {
        enumerable: true,
        value: async function (transaction) {
            if (!this._build || !this._sign) Object.assign(this, await import((new URL('./xdr.js', import.meta.url)).href))
            const transactionXdr = await this._build(transaction)
            return fetch(`${this.network.endpoint}/transactions?tx=${await this._sign(transactionXdr)}`, { method: 'POST', headers: { Accept: "application/json" } })
        }
    },
    utils: {
        enumerable: true,
        value: {
            keyTypeMap: {
                STRKEY_PUBKEY: 6 << 3,
                STRKEY_MUXED: 12 << 3,
                STRKEY_PRIVKEY: 18 << 3,
                STRKEY_PRE_AUTH_TX: 19 << 3,
                STRKEY_HASH_X: 23 << 3,
                STRKEY_SIGNED_PAYLOAD: 15 << 3,
                STRKEY_CONTRACT: 2 << 3
            },
            algorithmMap: {
                STRKEY_ALG_ED25519: 0,
                STRKEY_ALG_SHA256: 0
            },
            addressToPublicKeyBytes: function (address) {
            },
            bytesPublicKeyToAddress: function (addressBytes, memoBytes = [], payloadBytes = [], keyType = 'STRKEY_PUBKEY', algorithm = 'STRKEY_ALG_ED25519') {
                // https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0023.md
                // https://datatracker.ietf.org/doc/html/rfc4648
                const bytes = []

                // 1. Start with the appropriate version byte computed by the OR of a key type base value and algorithm selector from the tables above
                const versionByte = this.keyTypeMap[keyType] | this.algorithmMap[algorithm]
                bytes.push(versionByte)

                // 2. Append the binary bytes of the key (e.g., 32-bytes for ED25519).
                bytes.push(...Array.from(addressBytes))

                // 3. If we are encoding a multiplexed address, append an 8-byte memo ID in network byte order (most significant byte first).
                if ((keyType === 'STRKEY_MUXED') && memoBytes && memoBytes.length) bytes.push(...Array.from(memoBytes))

                // 4. If we are encoding a signed payload, append a 4-byte length in network byte order (most significant byte first) that holds 
                // the length of the payload, then append the payload, and finally zero padding of 0 to 3 zero bytes such that the total 
                // number of bytes of the payload plus the zero padding is a multiple of four.
                if ((keyType === 'STRKEY_SIGNED_PAYLOAD') && payloadBytes && payloadBytes.length) {
                    const payloadLengthView = new DataView(new ArrayBuffer(4))
                    payloadLengthView.setUint32(0, payloadBytes.length, false)
                    bytes.push(...Array.from(new Uint8Array(payloadLengthView.buffer)))
                    bytes.push(...Array.from(payloadBytes))
                    bytes.push(...(new Array(paddingLength = 4 - payloadBytes.length % 4)).fill(0))
                }

                // 5. Compute a 16-bit CRC16 checksum of the result of the prior step (using polynomial x16 + x12 + x5 + 1). 
                // Append the two-byte checksum to the result of the previous step (e.g., producing a 35-byte quantity for a 
                // non-multiplexed ED25519 public key, or 43 byte quantity for a multiplexed one).


                // 6. Encode the result of the previous step using RFC4648 base-32 encoding without padding. For example, a multiplexed address 
                // yields a 43-byte quantity whose base-32 encoding is 69 bytes with no trailing = signs because no padding is allowed.


                return bytes
            }
        }
    },

})
const listenable = ['ledgers', 'transactions', 'operations', 'payments', 'effects', 'accounts', 'trades', 'order_book']
for (const t in horizon._types) {
    horizon.get[t] = horizon._get.bind(horizon, t)
    horizon.stream[t] = horizon._stream.bind(horizon, t)
    if (listenable.includes(t)) horizon.listen[t] = horizon._listen.bind(horizon, t)
}

export { horizon }