const assetCodeToBytes = (assetCode) => {
    let bytes = []
    for (let i = 0; i < assetCode.length; i++) bytes.push(assetCode.charCodeAt(i))
    const paddingLength = assetCode.length <= 4 ? 4 : 12;
    while (bytes.length < paddingLength) bytes.push(0)
    return bytes
}

const bytesToHex = (bytes) => {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hexString) {
    return Uint8Array.from(hexString.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)))
}

const decimalToStellarPrice = (decimalPrice) => {
    const d = 10000000000, n = Math.round(decimalPrice * denominator)
    return { n, d }
}

const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

const keyTypeMap = {
    STRKEY_PUBKEY: [6 << 3, 'PK'], STRKEY_MUXED: [12 << 3, 'PK'], STRKEY_PRIVKEY: [18 << 3, 'PK'],
    STRKEY_PRE_AUTH_TX: [19 << 3, 'Hash'], STRKEY_HASH_X: [23 << 3, 'Hash'],
    STRKEY_SIGNED_PAYLOAD: [15 << 3, 'PK'], STRKEY_CONTRACT: [2 << 3, 'Hash']
}

const base32Decode = base32String => {
    let [bytes, bits, value, index, i] = [[], 0, 0, 0, 0]
    for (; i < base32String.length; i++) {
        [value, bits] = [(value << 5) | (index = base32Chars.indexOf(base32String[i])), bits + 5]
        if (index === -1) throw new Error('Invalid base-32 character')
        while (bits >= 8) {
            bytes.push(value >>> (bits - 8) & 0xFF)
            bits -= 8
            value &= (1 << bits) - 1
        }
    }
    return new Uint8Array(bytes)
}

const base32Encode = bytes => {
    let [base32String, bits, value, index, i] = ['', 0, 0, 0, 0]
    for (; i < bytes.length; i++) {
        [value, bits] = [(value << 8) | bytes[i], bits + 8]
        while (bits >= 5) [base32String, bits] = [base32String + base32Chars[index = (value >>> (bits - 5)) & 31], bits - 5]
    }
    if (bits > 0) [index, base32String] = [(value << (5 - bits)) & 31, base32String + base32Chars[index]]
    return base32String
}

const addressToPublicKeyBytes = addressString => {
    let [bytes, addressBytes, memoBytes, payloadBytes] = [base32Decode(addressString)], keyType
    for (const k in keyTypeMap) if (base32Encode([keyTypeMap[k][0]])[0] === addressString[0]) { keyType = k; break }
    bytes = bytes.slice(1, -2)
    addressBytes = bytes.slice(0, 32)
    if (keyType === 'STRKEY_MUXED') memoBytes = bytes.slice(0, 8)
    if (keyType === 'STRKEY_SIGNED_PAYLOAD') payloadBytes = bytes.slice(4, 4 + (new DataView(bytes.buffer, 0, 4)).getUint32(0, false))
    return [addressBytes, memoBytes, payloadBytes, keyType]
}

const getSHA256HashBytes = async (input) => {
    const encoder = new TextEncoder(), inputBytes = encoder.encode(input),
        hashBuffer = await crypto.subtle.digest('SHA-256', inputBytes)
    return Array.from(new Uint8Array(hashBuffer))
}

const operationFieldProcessors = {
    account: a => ({ ed25519: addressToPublicKeyBytes(a)[0], type: 'KEY_TYPE_ED25519' }),
    asset: function (a) {
        const asset = { type: 'ASSET_TYPE_NATIVE' }
        if (!a || (typeof a !== 'string')) return asset
        const [assetCode, issuer] = a.split(':', 2)
        if (!issuer) return asset
        if (assetCode <= 4) {
            asset.type = `ASSET_TYPE_CREDIT_ALPHANUM4`
        } else if (assetCode <= 12) {
            asset.type = `ASSET_TYPE_CREDIT_ALPHANUM12`
        }
        asset.alphaNum4 = { assetCode: assetCodeToBytes(assetCode), issuer: this.account(issuer) }
        return asset
    },
    hyper: n => BigInt(n),
    price: p => decimalToStellarPrice(p),
    publicKey: a => ({ ed25519: addressToPublicKeyBytes(a)[0], type: 'PUBLIC_KEY_TYPE_ED25519' }),
}

const operationFieldProcessorMap = {
    CREATE_ACCOUNT: { destination: operationFieldProcessors.publicKey, startingBalance: operationFieldProcessors.hyper },
    PAYMENT: { destination: operationFieldProcessors.account, asset: operationFieldProcessors.asset, amount: operationFieldProcessors.hyper },
    PATH_PAYMENT_STRICT_RECEIVE: {
        sendAsset: operationFieldProcessors.asset, destination: operationFieldProcessors.account,
        destAsset: operationFieldProcessors.asset
    },
    MANAGE_SELL_OFFER: { selling: operationFieldProcessors.asset, buying: operationFieldProcessors.asset, price: operationFieldProcessors.price },
    CREATE_PASSIVE_SELL_OFFER: { selling: operationFieldProcessors.asset, buying: operationFieldProcessors.asset, price: operationFieldProcessors.price },
    SET_OPTIONS: { inflationDest: operationFieldProcessors.account },
    CHANGE_TRUST: { line: operationFieldProcessors.asset },
    ALLOW_TRUST: { trustor: operationFieldProcessors.account, asset: operationFieldProcessors.asset },
    ACCOUNT_MERGE: { destination: operationFieldProcessors.account },
    INFLATION: {},
    MANAGE_DATA: {},
    BUMP_SEQUENCE: {},
    MANAGE_BUY_OFFER: { selling: operationFieldProcessors.asset, buying: operationFieldProcessors.asset, price: operationFieldProcessors.price },
    PATH_PAYMENT_STRICT_SEND: {
        sendAsset: operationFieldProcessors.asset, destination: operationFieldProcessors.account,
        destAsset: operationFieldProcessors.asset
    },
    CREATE_CLAIMABLE_BALANCE: { asset: operationFieldProcessors.asset },
    CLAIM_CLAIMABLE_BALANCE: {},
    BEGIN_SPONSORING_FUTURE_RESERVES: { sponsoredID: operationFieldProcessors.account },
    END_SPONSORING_FUTURE_RESERVES: {},
    REVOKE_SPONSORSHIP: {},
    CLAWBACK: { asset: operationFieldProcessors.asset, from: operationFieldProcessors.account },
    CLAWBACK_CLAIMABLE_BALANCE: {},
    SET_TRUST_LINE_FLAGS: { trustor: operationFieldProcessors.account, asset: operationFieldProcessors.asset },
    LIQUIDITY_POOL_DEPOSIT: { minPrice: operationFieldProcessors.price, maxPrice: operationFieldProcessors.price },
    LIQUIDITY_POOL_WITHDRAW: { minPrice: operationFieldProcessors.price, maxPrice: operationFieldProcessors.price },
    INVOKE_HOST_FUNCTION: {},
    EXTEND_FOOTPRINT_TTL: {},
    RESTORE_FOOTPRINT: {}
}


export default {
    base32Chars, bytesToHex, hexToBytes,
    algorithms: { PK: 0, Hash: 0 },
    keyTypeMap,
    operationFieldProcessors,
    crc16: function (bytes) {
        let [crc, i, j] = [0x0000, 0, 0]
        for (; i < bytes.length; i++) for ((crc ^= bytes[i] << 8, j = 0); j < 8; j++) crc = ((crc & 0x8000) !== 0)
            ? (((crc << 1) & 0xFFFF) ^ 0x1021) : ((crc << 1) & 0xFFFF)
        return new Uint8Array([crc & 0xFF, crc >> 8])
    },
    base32Decode,
    base32Encode,
    addressToPublicKeyBytes,
    bytesPublicKeyToAddress: function (addressBytes, memoBytes = [], payloadBytes = [], keyType = 'STRKEY_PUBKEY') {
        const bytes = [keyTypeMap[keyType][0] | this.algorithms[keyTypeMap[keyType][1]], ...addressBytes]
        if ((keyType === 'STRKEY_MUXED') && memoBytes && memoBytes.length) bytes.push(...memoBytes)
        if ((keyType === 'STRKEY_SIGNED_PAYLOAD') && payloadBytes && payloadBytes.length) {
            const payloadLengthView = new DataView(new ArrayBuffer(4))
            payloadLengthView.setUint32(0, payloadBytes.length, false)
            bytes.push(...(new Uint8Array(payloadLengthView.buffer)), ...payloadBytes, ...(new Uint8Array(4 - payloadBytes.length % 4)).fill(0))
        }
        bytes.push(...this.crc16(bytes))
        return base32Encode(new Uint8Array(bytes))
    },
    createTransactionSourceObject: async function (transactionSimpleObject) {
        const transactionSourceObject = {
            sourceAccount: { ed25519: addressToPublicKeyBytes(transactionSimpleObject.sourceAccount)[0], type: 'KEY_TYPE_ED25519' },
            ext: { v: 0 },
            fee: transactionSimpleObject.fee,
            memo: { type: 'MEMO_NONE' },
            cond: { type: 'PRECOND_NONE' },
            seqNum: BigInt(parseInt((await this._horizon.get.accounts(transactionSimpleObject.sourceAccount)).sequence) + 1),
            operations: []
        }
        switch (transactionSimpleObject.memo?.type) {
            case 'MEMO_TEXT':
                transactionSourceObject.memo = { type: 'MEMO_TEXT', text: transactionSimpleObject.memo.content }
                break
            case 'MEMO_ID':
                transactionSourceObject.memo = { type: 'MEMO_ID', id: transactionSimpleObject.memo.content }
                break
            case 'MEMO_HASH':
                transactionSourceObject.memo = { type: 'MEMO_HASH', hash: transactionSimpleObject.memo.content }
                break
            case 'MEMO_RETURN':
                transactionSourceObject.memo = { type: 'MEMO_RETURN', retHash: transactionSimpleObject.memo.content }
                break
        }
        for (const condType of ['timeBounds', 'ledgerBounds', 'minSeqNum', 'minSeqAge', 'minSeqLedgerGap', 'extraSigners']) {
            if (!(transactionSimpleObject?.cond ?? {})[condType]) continue
            delete transactionSourceObject.cond.type
            switch (condType) {
                case 'timeBounds': case 'ledgerBounds':
                    const { min, max } = transactionSimpleObject.cond[condType]
                    if (min || max) {
                        transactionSourceObject.cond[condType] = {}
                        if (min) transactionSourceObject.cond[condType][condType === 'timeBounds' ? 'minTime' : 'minLedger'] = BigInt(min)
                        if (max) transactionSourceObject.cond[condType][condType === 'timeBounds' ? 'maxTime' : 'maxLedger'] = BigInt(max)
                        transactionSourceObject.cond.type = condType === 'timeBounds' ? 'PRECOND_TIME' : 'PRECOND_V2'
                        if (condType === 'ledgerBounds') {
                            transactionSourceObject.cond.v2 ||= {}
                            if (transactionSourceObject.cond.timeBounds) transactionSourceObject.cond.v2.timeBounds = { ...transactionSourceObject.cond.timeBounds }
                            if (transactionSourceObject.cond.ledgerBounds) transactionSourceObject.cond.v2.ledgerBounds = { ...transactionSourceObject.cond.ledgerBounds }
                            delete transactionSourceObject.cond.timeBounds
                            delete transactionSourceObject.cond.ledgerBounds
                        }
                    }
                    break
                case 'minSeqNum': case 'minSeqAge': case 'minSeqLedgerGap': case 'extraSigners':
                    transactionSourceObject.cond.type = 'PRECOND_V2'
                    transactionSourceObject.cond.v2 ||= {}
                    if (transactionSourceObject.cond.timeBounds) transactionSourceObject.cond.v2.timeBounds = { ...transactionSourceObject.cond.timeBounds }
                    delete transactionSourceObject.cond.timeBounds
                    switch (condType) {
                        case 'minSeqNum': case 'minSeqAge': case 'minSeqLedgerGap':
                            transactionSourceObject.cond.v2[condType] = BigInt(parseInt(transactionSimpleObject.cond[condType]))
                            break
                        case 'extraSigners':
                            let extraSigners
                            try { extraSigners = JSON.parse(transactionSimpleObject.cond[condType]) } catch (e) { }
                            if (extraSigners) transactionSourceObject.cond.v2[condType] = extraSigners
                    }
                    break
            }
        }
        for (const operation of (transactionSimpleObject.operations ?? [])) {
            const { type, op } = operation, { sourceAccount } = op
            if (sourceAccount) delete op.sourceAccount
            if (type in operationFieldProcessorMap) for (const p in op) if (p in operationFieldProcessorMap[type]) op[p] = operationFieldProcessorMap[type][p].bind(operationFieldProcessors)(op[p])
            const operationProperty = type.toLowerCase().split('_').map((v, i) => i ? `${v[0].toUpperCase()}${v.slice(1)}` : v).join('') + 'Op',
                operationObject = { body: { type, [operationProperty]: { ...op } } }
            if (sourceAccount) operationObject.sourceAccount = operationFieldProcessors.account(sourceAccount)
            transactionSourceObject.operations.push(operationObject)
        }
        if (transactionSimpleObject.sorobanData) transactionSourceObject.ext = { v: 1, sorobanData: transactionSimpleObject.sorobanData }
        return transactionSourceObject
    },
    wrapAsSignaturePayload: async (tx, network) => {
        return {
            networkId: await getSHA256HashBytes(network.passphrase),
            taggedTransaction: { type: 'ENVELOPE_TYPE_TX', tx }
        }
    },
    hashSignaturePayload: async (payloadInstance) => {
        const hashBuffer = await crypto.subtle.digest('SHA-256', payloadInstance.bytes)
        return new Uint8Array(hashBuffer)
    },
    signSignaturePayload: async (payloadHash, secretKey, publicKeyBytes) => {
        const payloadHashBytes = typeof payloadHash === 'string' ? hexToBytes(payloadHash) : payloadHash
        const secretKeyBytes = base32Decode(secretKey.slice(1)).slice(0, -2)
        let signature
        try {
            const signingAlgorithm = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' }
            const key = await crypto.subtle.importKey('raw', secretKey, signingAlgorithm, false, ['sign'])
            signature = new Uint8Array(await crypto.subtle.sign(signingAlgorithm, key, data))
        } catch (e) {
            const ed = await import('https://cdn.jsdelivr.net/npm/@noble/ed25519@2.1.0/+esm')
            signature = await ed.signAsync(payloadHashBytes, secretKeyBytes)
        }
        return signature
    }

}
