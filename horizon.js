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

const metaUrl = new URL(import.meta.url), metaOptions = metaUrl.searchParams, networkOption = metaOptions.get('network')
let endpoint
switch (networkOption) {
    case 'futurenet':
        endpoint = 'https://horizon-futurenet.stellar.org'
        break
    case 'test':
        endpoint = 'https://horizon-testnet.stellar.org'
        break
    case 'custom':

        break
    default:
        endpoint = 'https://horizon.stellar.org'
}

const horizon = Object.defineProperties(horizon, {
    endpoint: {
        enumerable: true,
        writable: true,
        value: 'https://horizon-testnet.stellar.org',
    },
    _template: {
        value: async function (resourceType, resourceId, scope, params) {
            if (!resourceId) return fetch(`${this.endpoint}/${resourceType}?${new URLSearchParams(params)}`, { headers: { Accept: "application/json" } }).then(r => r.json())
            if (!scope) return fetch(`${this.endpoint}/${resourceType}/${resourceId}`, { headers: { Accept: "application/json" } }).then(r => r.json())
            return fetch(`${this.endpoint}/${resourceType}/${resourceId}/${scope}?${new URLSearchParams(params)}`, { headers: { Accept: "application/json" } }).then(r => r.json())
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

for (const resourceType in horizonResourceTypes) horizon[resourceType] = horizonResourceTemplateMethod.bind(horizon, resourceType)




export { utils, horizon }