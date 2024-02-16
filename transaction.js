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

const _build = function (transaction) {

}

const _sign = function (input) {

}

export { _build, _sign }