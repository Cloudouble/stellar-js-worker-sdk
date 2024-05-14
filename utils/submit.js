const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', base32Decode = base32String => {
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
}, base32Encode = bytes => {
    let [base32String, bits, value, index, i] = ['', 0, 0, 0, 0]
    for (; i < bytes.length; i++) {
        [value, bits] = [(value << 8) | bytes[i], bits + 8]
        while (bits >= 5) [base32String, bits] = [base32String + base32Chars[index = (value >>> (bits - 5)) & 31], bits - 5]
    }
    if (bits > 0) [index, base32String] = [(value << (5 - bits)) & 31, base32String + base32Chars[index]]
    return base32String
}, keyTypeMap = {
    STRKEY_PUBKEY: [6 << 3, 'PK'], STRKEY_MUXED: [12 << 3, 'PK'], STRKEY_PRIVKEY: [18 << 3, 'PK'],
    STRKEY_PRE_AUTH_TX: [19 << 3, 'Hash'], STRKEY_HASH_X: [23 << 3, 'Hash'],
    STRKEY_SIGNED_PAYLOAD: [15 << 3, 'PK'], STRKEY_CONTRACT: [2 << 3, 'Hash']
}, addressToKeyBytes = addressString => {
    let [bytes, addressBytes, memoBytes, payloadBytes] = [base32Decode(addressString), undefined, undefined, undefined], keyType
    for (const k in keyTypeMap) if (base32Encode([keyTypeMap[k][0]])[0] === addressString[0]) { keyType = k; break }
    bytes = bytes.slice(1, -2)
    addressBytes = bytes.slice(0, 32)
    if (keyType === 'STRKEY_MUXED') memoBytes = bytes.slice(0, 8)
    if (keyType === 'STRKEY_SIGNED_PAYLOAD') payloadBytes = bytes.slice(4, 4 + (new DataView(bytes.buffer, 0, 4)).getUint32(0, false))
    return [addressBytes, memoBytes, payloadBytes, keyType]
}, operationFieldProcessors = {
    account: a => ({ ed25519: addressToKeyBytes(a)[0], type: 'KEY_TYPE_ED25519' }),
    asset: function (a) {
        const asset = { type: 'ASSET_TYPE_NATIVE' }
        if (!a || (typeof a !== 'string')) return asset
        const [assetCode, issuer] = a.split(':', 2)
        if (!issuer) return asset
        asset.type = parseInt(assetCode) <= 4 ? 'ASSET_TYPE_CREDIT_ALPHANUM4' : (parseInt(assetCode) <= 12 ? 'ASSET_TYPE_CREDIT_ALPHANUM12' : 'ASSET_TYPE_NATIVE')
        if (asset.type === 'ASSET_TYPE_NATIVE') return asset
        const assetCodeToBytes = assetCode => {
            let bytes = []
            for (let i = 0; i < assetCode.length; i++) bytes.push(assetCode.charCodeAt(i))
            const paddingLength = assetCode.length <= 4 ? 4 : 12;
            while (bytes.length < paddingLength) bytes.push(0)
            return bytes
        }
        asset[asset.type === 'ASSET_TYPE_CREDIT_ALPHANUM4' ? 'alphaNum4' : 'alphaNum12'] = { assetCode: assetCodeToBytes(assetCode), issuer: this.account(issuer) }
        return asset
    },
    hyper: n => BigInt(n),
    price: (p, d = 10000000000) => ({ n: Math.round(p * d), d }),
    publicKey: a => ({ ed25519: addressToKeyBytes(a)[0], type: 'PUBLIC_KEY_TYPE_ED25519' }),
}, operationFieldProcessorMap = {
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
    addressToKeyBytes,
    getSHA256HashBytes: async (input) => new Uint8Array(await crypto.subtle.digest('SHA-256', (typeof input === 'string' ? (new TextEncoder()).encode(input) : input))),
    createTransactionSourceObject: async function (transaction) {
        if (transaction.memo) {
            if (typeof transaction.memo === 'string') {
                transaction.memo = { type: 'MEMO_TEXT', content: transaction.memo }
            } else if (Number.isInteger(transaction.memo)) {
                transaction.memo = { type: 'MEMO_ID', content: transaction.memo }
            }
        } else {
            delete transaction.memo
        }
        const tx = {
            sourceAccount: { ed25519: addressToKeyBytes(transaction.sourceAccount)[0], type: 'KEY_TYPE_ED25519' },
            ext: { v: 0 }, fee: transaction.fee, memo: { type: 'MEMO_NONE' }, cond: { type: 'PRECOND_NONE' },
            seqNum: BigInt(parseInt(transaction.seqNum) || (parseInt((await this._horizon.get.accounts(transaction.sourceAccount)).sequence) + 1)), operations: []
        }, contentFieldNameMap = { MEMO_TEXT: 'text', MEMO_ID: 'id', MEMO_HASH: 'hash', MEMO_RETURN: 'retHash' },
            memoType = transaction.memo?.type ?? 'MEMO_NONE'
        if (transaction.memo?.content && (memoType !== 'MEMO_NONE')) {
            let memoContent = memoType === 'MEMO_TEXT' ? `${transaction.memo.content}` : (memoType === 'MEMO_ID' ? BigInt(transaction.memo.content) : Array.from(transaction.memo.content))
            tx.memo = { type: memoType, [contentFieldNameMap[memoType]]: memoContent }
        }
        for (const condType of ['timeBounds', 'ledgerBounds', 'minSeqNum', 'minSeqAge', 'minSeqLedgerGap', 'extraSigners']) {
            if (!(transaction?.cond ?? {})[condType]) continue
            delete tx.cond.type
            switch (condType) {
                case 'timeBounds': case 'ledgerBounds':
                    const { min, max } = transaction.cond[condType]
                    if (min || max) {
                        tx.cond[condType] = {}
                        if (min) tx.cond[condType][condType === 'timeBounds' ? 'minTime' : 'minLedger'] = BigInt(min)
                        if (max) tx.cond[condType][condType === 'timeBounds' ? 'maxTime' : 'maxLedger'] = BigInt(max)
                        tx.cond.type = condType === 'timeBounds' ? 'PRECOND_TIME' : 'PRECOND_V2'
                        if (condType === 'ledgerBounds') {
                            tx.cond.v2 ||= {}
                            if (tx.cond.timeBounds) tx.cond.v2.timeBounds = { ...tx.cond.timeBounds }
                            if (tx.cond.ledgerBounds) tx.cond.v2.ledgerBounds = { ...tx.cond.ledgerBounds }
                            delete tx.cond.timeBounds
                            delete tx.cond.ledgerBounds
                        }
                    }
                    break
                case 'minSeqNum': case 'minSeqAge': case 'minSeqLedgerGap': case 'extraSigners':
                    tx.cond.type = 'PRECOND_V2'
                    tx.cond.v2 ||= {}
                    if (tx.cond.timeBounds) tx.cond.v2.timeBounds = { ...tx.cond.timeBounds }
                    delete tx.cond.timeBounds
                    switch (condType) {
                        case 'minSeqNum': case 'minSeqAge': case 'minSeqLedgerGap':
                            tx.cond.v2[condType] = BigInt(parseInt(transaction.cond[condType]))
                            break
                        case 'extraSigners':
                            let extraSigners
                            try { extraSigners = JSON.parse(transaction.cond[condType]) } catch (e) { }
                            if (extraSigners) tx.cond.v2[condType] = extraSigners
                    }
                    break
            }
        }
        for (const operation of (transaction.operations ?? [])) {
            const { type, op } = operation, { sourceAccount } = op
            if (sourceAccount) delete op.sourceAccount
            if (type in operationFieldProcessorMap) for (const p in op) if (p in operationFieldProcessorMap[type]) op[p] = operationFieldProcessorMap[type][p].bind(operationFieldProcessors)(op[p])
            const operationProperty = type.toLowerCase().split('_').map((v, i) => i ? `${v[0].toUpperCase()}${v.slice(1)}` : v).join('') + 'Op',
                operationObject = { body: { type, [operationProperty]: { ...op } } }
            if (sourceAccount) operationObject.sourceAccount = operationFieldProcessors.account(sourceAccount)
            tx.operations.push(operationObject)
        }
        if (transaction.sorobanData) tx.ext = { v: 1, sorobanData: transaction.sorobanData }
        return tx
    },
    signSignaturePayload: async function (payloadHash, secretKey) {
        const bytes = typeof payloadHash === 'string' ? Uint8Array.from(payloadHash.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))) : payloadHash,
            secretKeyBytes = typeof secretKey === 'string' ? base32Decode(secretKey.slice(1)).slice(0, -2) : new Uint8Array(secretKey)
        if (!this.ed25519) {
            try {
                const signingAlgorithm = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' },
                    key = await crypto.subtle.importKey('raw', secretKeyBytes, signingAlgorithm, false, ['sign'])
                return new Uint8Array(await crypto.subtle.sign(signingAlgorithm, key, bytes))
            } catch (e) {
                this.ed25519 = {}
                this.ed25519.signAsync = (await import(this._horizon.options.sources.ed25519)).signAsync
            }
        }
        return await this.ed25519.signAsync(bytes, secretKeyBytes)
    }

}
