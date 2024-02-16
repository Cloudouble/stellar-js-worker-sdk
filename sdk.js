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
    _stream: {
        value: async function* (resourceType, resourceId, scope, params = {}) {
            if (!(resourceType in this._types)) return
            // if (!result && (typeof resourceId === 'object')) {
            //     if (!this._build || !this._sign) Object.assign(this, await import('./transaction.js'))
            //     const transaction = await this._build(resourceId)
            //     return fetch(`${this.network.endpoint}/${resourceType}?tx=${await this._sign(transaction)}`, { method: 'POST', headers })
            // }
            const headers = { Accept: 'application/json' }, getResultPage = async () => {
                let result
                if (!resourceId) result = await fetch(`${this.network.endpoint}/${resourceType}?${new URLSearchParams(params)}`, { headers }).then(r => r.json())
                if (!result && !scope) result = await fetch(`${this.network.endpoint}/${resourceType}/${resourceId}`, { headers }).then(r => r.json())
                if (!result && !this._types[resourceType]) return
                if (!result && !this._types[resourceType].includes(scope)) return
                if (!result && (resourceType === 'accounts') && (scope === 'data')) result = await fetch(`${this.network.endpoint}/${resourceType}/${resourceId}/${scope}/${params}`, { headers }).then(r => r.json())
                result ||= await fetch(`${this.network.endpoint}/${resourceType}/${resourceId}/${scope}?${new URLSearchParams(params)}`, { headers: { Accept: "application/json" } }).then(r => r.json())
                return result._embedded?.records ?? [result]
            }
            let page = await getResultPage(), pageOrigLength = page.length, isLastPage = pageOrigLength < (params?.limit ?? 10), pagingToken
            while (page.length) {
                const record = await page.shift()
                if (!record) break
                pagingToken = record.paging_token
                delete record.paging_token
                yield record
                if (!page.length && !isLastPage && pagingToken && (params && (typeof params === 'object'))) {
                    params.cursor = pagingToken
                    page = await getResultPage()
                    pageOrigLength = page.length
                    isLastPage = pageOrigLength < (params?.limit ?? 10)
                }
            }
            return
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
    }
})
for (const t in horizon._types) {
    horizon.stream[t] = horizon._stream.bind(horizon, t)
}

export { horizon }