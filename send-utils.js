const sendUtils = {
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
export { sendUtils }