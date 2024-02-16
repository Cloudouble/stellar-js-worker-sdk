const utils = {
    decodeXDR: function (buffer) {
        let pos = 0
        function read(type) {
            let typeNum = buffer[pos++], value = 0
            switch (type) {
                case 'int':
                    let bytes = [], bytesLast
                    while (bytesLast !== 0 && bytesLast !== 0xff) bytes.push(bytesLast = buffer[pos++])
                    for (let i = bytes.length - 1; i >= 0; i--) value = (value << 8) + bytes[i]
                    break
                case 'string':
                    let chars = [], code
                    while (code !== 0) chars.push(String.fromCharCode(code = buffer[pos++]))
                    value = chars.join('')
            }
            return value
        }
        return { intValue: read('int'), stringValue: read('string') }
    },
    encodeXDR: function (xdr) {
        let buffer = []
        function write(value, type) {
            const typeMap = { int: 0, string: 1 }
            buffer.push(typeMap[type])
            switch (type) {
                case 'int':
                    let bytes = [], num = value
                    while (num !== 0 && num !== -1) { bytes.unshift(num & 0xff); num = num >> 8 }
                    buffer.push(...bytes)
                    break
                case 'string':
                    for (const c of value) buffer.push(c.charCodeAt())
                    buffer.push(0)
                    break
            }
        }
        write(data.intValue, 'int')
        write(data.stringValue, 'string')
        return buffer
    },
}

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
    _template: {
        value: async function (resourceType, resourceId, scope, params) {
            if (!(resourceType in this._types)) return
            if (!resourceId) return fetch(`${this.network.endpoint}/${resourceType}?${new URLSearchParams(params)}`, { headers: { Accept: "application/json" } }).then(r => r.json())
            if (!scope) return fetch(`${this.network.endpoint}/${resourceType}/${resourceId}`, { headers: { Accept: "application/json" } }).then(r => r.json())
            if (!this._types[resourceType]) return
            if (!this._types[resourceType].includes(scope)) return
            return fetch(`${this.network.endpoint}/${resourceType}/${resourceId}/${scope}?${new URLSearchParams(params)}`, { headers: { Accept: "application/json" } }).then(r => r.json())
        }
    },
    _types: {
        value: {
            accounts: ['transactions', 'operations', 'payments', 'effects', 'offers', 'trades'], // 'data'
            assets: null,
            claimable_balances: ['transactions', 'operations'],
            effects: null,
            ledgers: ['transactions', 'payments', 'operations', 'effects'],
            liquidity_pools: ['effects', 'trades', 'transactions', 'operations'],
            offers: ['trades'],
            operations: ['effects'],
            payments: null,
            trades: null,
            transactions: ['operations', 'effects'], // 'submit'
            order_book: null,
            paths: ['strict-receive', 'strict-send'],
            trade_aggregations: null,
            fee_stats: null
        }
    }
})
for (const t in horizon._types) horizon[t] = horizon._template.bind(horizon, t)




export { utils, horizon }