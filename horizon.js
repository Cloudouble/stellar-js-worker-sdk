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
            base32Chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
            algorithms: { PK: 0, Hash: 0 },
            keyTypeMap: {
                STRKEY_PUBKEY: [6 << 3, 'PK'], STRKEY_MUXED: [12 << 3, 'PK'], STRKEY_PRIVKEY: [18 << 3, 'PK'],
                STRKEY_PRE_AUTH_TX: [19 << 3, 'Hash'], STRKEY_HASH_X: [23 << 3, 'Hash'],
                STRKEY_SIGNED_PAYLOAD: [15 << 3, 'PK'], STRKEY_CONTRACT: [2 << 3, 'Hash']
            },
            crc16: function (bytes) {
                let [crc, i, j] = [0x0000, 0, 0]
                for (; i < bytes.length; i++) for ((crc ^= bytes[i] << 8, j = 0); j < 8; j++) crc = ((crc & 0x8000) !== 0)
                    ? (((crc << 1) & 0xFFFF) ^ 0x1021) : ((crc << 1) & 0xFFFF)
                return new Uint8Array([crc & 0xFF, crc >> 8])
            },
            base32Decode: function (base32String) {
                let [bytes, bits, value, index, i] = [[], 0, 0, 0, 0]
                for (; i < base32String.length; i++) {
                    [value, bits] = [(value << 5) | (index = this.base32Chars.indexOf(base32String[i])), bits + 5]
                    if (index === -1) throw new Error('Invalid base-32 character')
                    while (bits >= 8) {
                        bytes.push(value >>> (bits - 8) & 0xFF)
                        bits -= 8
                        value &= (1 << bits) - 1
                    }
                }
                return new Uint8Array(bytes)
            },
            base32Encode: function (bytes) {
                let [base32String, bits, value, index, i] = ['', 0, 0, 0, 0]
                for (; i < bytes.length; i++) {
                    [value, bits] = [(value << 8) | bytes[i], bits + 8]
                    while (bits >= 5) [base32String, bits] = [base32String + this.base32Chars[index = (value >>> (bits - 5)) & 31], bits - 5]
                }
                if (bits > 0) [index, base32String] = [(value << (5 - bits)) & 31, base32String + this.base32Chars[index]]
                return base32String
            },
            addressToPublicKeyBytes: function (addressString) {
                let [bytes, addressBytes, memoBytes, payloadBytes] = [this.base32Decode(addressString)], keyType
                for (const k in this.keyTypeMap) if (this.base32Encode([this.keyTypeMap[k][0]])[0] === addressString[0]) { keyType = k; break }
                bytes = bytes.slice(1, -2)
                addressBytes = bytes.slice(0, 32)
                if (keyType === 'STRKEY_MUXED') memoBytes = bytes.slice(0, 8)
                if (keyType === 'STRKEY_SIGNED_PAYLOAD') payloadBytes = bytes.slice(4, 4 + (new DataView(bytes.buffer, 0, 4)).getUint32(0, false))
                return [addressBytes, memoBytes, payloadBytes, keyType]
            },
            bytesPublicKeyToAddress: function (addressBytes, memoBytes = [], payloadBytes = [], keyType = 'STRKEY_PUBKEY') {
                const bytes = [this.keyTypeMap[keyType][0] | this.algorithms[this.keyTypeMap[keyType][1]], ...addressBytes]
                if ((keyType === 'STRKEY_MUXED') && memoBytes && memoBytes.length) bytes.push(...memoBytes)
                if ((keyType === 'STRKEY_SIGNED_PAYLOAD') && payloadBytes && payloadBytes.length) {
                    const payloadLengthView = new DataView(new ArrayBuffer(4))
                    payloadLengthView.setUint32(0, payloadBytes.length, false)
                    bytes.push(...(new Uint8Array(payloadLengthView.buffer)), ...payloadBytes, ...(new Uint8Array(4 - payloadBytes.length % 4)).fill(0))
                }
                bytes.push(...this.crc16(bytes))
                return this.base32Encode(new Uint8Array(bytes))
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