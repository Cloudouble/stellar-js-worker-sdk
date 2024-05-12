const metaOptions = 'url' in (import.meta || {}) ? (new URL(import.meta['url'])).searchParams : new URLSearchParams({}), networks = {
    futurenet: { endpoint: 'https://horizon-futurenet.stellar.org', passphrase: 'Test SDF Future Network ; October 2022' },
    test: { endpoint: 'https://horizon-testnet.stellar.org', passphrase: 'Test SDF Network ; September 2015' },
    custom: { endpoint: metaOptions.get('endpoint'), passphrase: metaOptions.get('passphrase') }
}, horizon = Object.defineProperties({}, {
    version: { enumerable: true, value: '0.9.0' },
    options: {
        enumerable: true, value: {
            sources: {
                xdr: 'https://cdn.jsdelivr.net/gh/cloudouble/simple-xdr@1.2.4/xdr.min.js',
                ed25519: 'https://cdn.jsdelivr.net/npm/@noble/ed25519@2.1.0/+esm'
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
            let result, cause, response = {}
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
                eventSource = new globalThis.EventSource(url)
            } catch (e) {
                throw new Error(`Event source creation failed for resourceType: ${resourceType}, resourceId: ${resourceId}, scope: ${scope}: ${e}`, { cause: e })
            }
            let hasOpened
            return new Promise((resolve, reject) => {
                eventSource.addEventListener('message', event => {
                    const { data, origin, lastEventId, source, ports } = event,
                        options = { data, origin, lastEventId, source, ports }
                    listener.dispatchEvent(new MessageEvent('message', options))
                }, { signal })
                eventSource.addEventListener('open', event => {
                    hasOpened = true
                    resolve({ listener, abortController, eventSource })
                }, { signal })
                eventSource.addEventListener('error', event => {
                    hasOpened ? listener.dispatchEvent(new globalThis.CustomEvent('error', { detail: event })) : reject()
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
                if (!page.length && !isLastPage && pagingToken && params) {
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
            let result, cause, response = {}
            result = (await fetch(`${this.network.endpoint}/accounts/${accountId}/data/${key}`, { headers: { Accept: "application/json" } })
                .then(r => { response = r; return r.json() }).catch(err => cause = err))?.value
            if (cause || !response.ok) throw new Error(
                `Network request fetch failed for accountId: ${accountId}, key: ${key}: ${cause ?? [response.status, response.statusText].join(': ')}`, { cause: cause ?? response })
            return result
        }
    },
    submit: {
        enumerable: true,
        value: async function* (transaction = {}, keyPairs = {}) {
            if (typeof keyPairs === 'string' && transaction.sourceAccount) keyPairs = { [transaction.sourceAccount]: keyPairs }
            const keyPairsEntries = Array.isArray(keyPairs) ? keyPairs : Object.entries(keyPairs)
            let sourceAccount = transaction.sourceAccount
            if (!sourceAccount && keyPairsEntries.length === 1) sourceAccount = keyPairsEntries[0][0]
            transaction.sourceAccount ??= sourceAccount
            if (!transaction.sourceAccount) throw new Error('No transaction.sourceAccount specified')
            yield { transaction }
            await Promise.all([this.utils._install('submit'), this.utils._install('xdr', 'xdr')])
            if (!this.utils.xdr.types.stellar) {
                const importBase = import.meta && ('url' in import.meta) ? import.meta['url'] : ''
                await this.utils.xdr.import((new URL('./lib/stellar.xdr', importBase)).href, 'stellar')
            }
            const tx = await this.utils.createTransactionSourceObject(transaction)
            yield { tx }
            const signaturePayloadXdr = new this.utils.xdr.types.stellar.TransactionSignaturePayload({
                networkId: Array.from(await this.utils.getSHA256HashBytes(this.network.passphrase)),
                taggedTransaction: { type: 'ENVELOPE_TYPE_TX', tx }
            })
            yield { signaturePayloadXdr }
            const hash = await this.utils.getSHA256HashBytes(signaturePayloadXdr.bytes)
            yield { hash }
            const signatures = [], signaturePromises = []
            for (const [publicKey, secretKey] of keyPairsEntries) {
                const [publicKeyBytes] = typeof publicKey === 'string' ? this.utils.addressToKeyBytes(publicKey) : [publicKey],
                    [secretKeyBytes] = typeof secretKey === 'string' ? this.utils.addressToKeyBytes(secretKey) : [secretKey]
                signaturePromises.push(
                    this.utils.signSignaturePayload(hash, secretKeyBytes).then(signature => signatures.push({
                        hint: publicKeyBytes.slice(-4), signature: Array.from(signature)
                    }))
                )
            }
            await Promise.all(signaturePromises)
            yield { signatures }
            const transactionEnvelopeXdr = new this.utils.xdr.types.stellar.TransactionEnvelope({ type: 'ENVELOPE_TYPE_TX', v1: { signatures, tx } })
            yield { transactionEnvelopeXdr }
            const response = await fetch(`${this.network.endpoint}/transactions?tx=${encodeURIComponent(transactionEnvelopeXdr.toString())}`, { method: 'POST', headers: { Accept: "application/json" } })
            if (!response.ok) throw new Error(`Network request fetch failed for transaction: ${JSON.stringify(transaction)}: ${[response.status, response.statusText].join(': ')}`, { cause: response })
            yield { response }
            return { transaction, tx, signaturePayloadXdr, hash, signatures, transactionEnvelopeXdr, response }
        }
    },
    utils: {
        enumerable: true,
        value: Object.defineProperties({}, {
            _install: {
                value: async function (scope, namespace) {
                    if (!scope || this._scopes[scope]) return
                    if (import.meta && ('url' in import.meta)) {
                        const scopeFileName = import.meta['url'].endsWith('.min.js') ? `${scope}.min` : scope,
                            url = (new URL((this._horizon?.options?.sources ?? {})[scope] ?? `./utils/${scopeFileName}.js`, import.meta['url'])).href
                        if (namespace) this[namespace] ??= {}
                        const importedUtil = (await import(url)).default
                        this._scopes[scope] = !!(namespace ? (this[namespace] = importedUtil) : Object.assign(this, importedUtil))
                        this._scope = scope
                    }
                }
            },
            _scope: { writable: true, value: undefined },
            _scopes: { value: {} }
        })
    }
})
const listenable = ['ledgers', 'transactions', 'operations', 'payments', 'effects', 'accounts', 'trades', 'order_book']
for (const t in horizon['_types']) {
    horizon['get'][t] = horizon['_get'].bind(horizon, t)
    horizon['stream'][t] = horizon['_stream'].bind(horizon, t)
    if (listenable.includes(t)) horizon['listen'][t] = horizon['_listen'].bind(horizon, t)
}
Object.defineProperty(horizon['utils'], '_horizon', { value: horizon })
export { horizon }

