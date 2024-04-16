const metaOptions = (new URL(import.meta.url)).searchParams, networks = {
    futurenet: { endpoint: 'https://horizon-futurenet.stellar.org', passphrase: 'Test SDF Future Network ; October 2022' },
    test: { endpoint: 'https://horizon-testnet.stellar.org', passphrase: 'Test SDF Network ; September 2015' },
    custom: { endpoint: metaOptions.get('endpoint'), passphrase: metaOptions.get('passphrase') }
}, horizon = Object.defineProperties({}, {
    version: { enumerable: true, value: '0.1.0' },
    options: {
        enumerable: true, value: {
            sources: {
                xdr: 'https://cdn.jsdelivr.net/gh/cloudouble/simple-xdr@1.1.0/xdr.min.js'
            }
        }
    },
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
        value: async function (transaction, keys, type) {
            await this.utils._install('send')
            await this.utils._install('xdr', 'xdr')
            if (!this.utils.xdr?.types?.stellar) await this.utils.xdr.load(this.options.sources.types)
            if (typeof type === 'string') if (this.utils.xdr?.types?.stellar[type]) type = this.utils.xdr.types.stellar[type]
            if (type.prototype instanceof this.utils.xdr.types.stellar.typedef) { }

            console.log('line 140', transaction)

            switch (transaction?.constructor) {
                case Array:
                    transaction = new Uint8Array(transaction)
                case Uint8Array: case String:
                    transaction = new type(transaction)
                    break
                default:
                    transaction = type ? new type(transaction) : this.utils.send.buildTransaction(transaction)
            }
            if (!(transaction instanceof this.utils.xdr.types.stellar.Transaction)
                && !(transaction instanceof this.utils.xdr.types.stellar.FeeBumpTransaction)) throw new Error('not valid transaction input')
            const envelopeType = transaction instanceof this.utils.xdr.types.stellar.Transaction ? 'ENVELOPE_TYPE_TX' : 'ENVELOPE_TYPE_TX_FEE_BUMP',
                transactionSignaturePayload = new this.utils.xdr.types.stellar.TransactionSignaturePayload({
                    networkID: this.network.networkId,
                    taggedTransaction: {
                        type: envelopeType,
                        [envelopeType === 'ENVELOPE_TYPE_TX_FEE_BUMP' ? 'feeBump' : 'tx']: transaction.value
                    }
                }), transactionSignaturePayloadBytes = transactionSignaturePayload.bytes,
                transactionSignaturePayloadHash = sha256(transactionSignaturePayloadBytes), signatures = []
            for (const key of keys) signatures.push(sign(transactionSignaturePayloadHash, key))

            const transactionEnvelope = new this.utils.xdr.types.stellar.TransactionEnvelope({
                type: envelopeType,
                [envelopeType === 'ENVELOPE_TYPE_TX_FEE_BUMP' ? 'feeBump' : 'tx']: {
                    tx: transaction.value,
                    signatures: signatures
                }
            })
            return fetch(`${this.network.endpoint}/transactions?tx=${transactionEnvelope}`, { method: 'POST', headers: { Accept: "application/json" } })
        }
    },
    utils: {
        enumerable: true,
        value: Object.defineProperties({}, {
            _install: {
                value: async function (scope, namespace) {
                    if (!this._scopes?.base) this._scopes.base = !!Object.assign(this, (await import((new URL('./utils/base.js', import.meta.url)).href)).default)
                    if (!scope || this._scopes[scope]) return
                    const url = (new URL((this._horizon?.options?.sources ?? {})[scope] ?? `./utils/${scope}.js`, import.meta.url)).href
                    if (namespace) this[namespace] ??= {}
                    this._scopes[scope] = !!Object.assign(namespace ? this[namespace] : this, (await import(url)).default)
                    this._scope = scope
                }
            },
            _scope: { writable: true, value: undefined },
            _scopes: { value: {} }
        })
    }
})
const listenable = ['ledgers', 'transactions', 'operations', 'payments', 'effects', 'accounts', 'trades', 'order_book']
for (const t in horizon._types) {
    horizon.get[t] = horizon._get.bind(horizon, t)
    horizon.stream[t] = horizon._stream.bind(horizon, t)
    if (listenable.includes(t)) horizon.listen[t] = horizon._listen.bind(horizon, t)
}
Object.defineProperty(horizon.utils, '_horizon', { value: horizon })
export { horizon }