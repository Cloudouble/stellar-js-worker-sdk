export default {
    async fetch(request, env, ctx) {

        const headers = {
            "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "GET,POST,DELETE,PUT,OPTIONS", "Access-Control-Max-Age": "86400",
            "Content-Type": "application/json", "Allow": "GET,POST,DELETE,PUT,OPTIONS"
        }
        const horizon = (await import('./include/stellar-js-worker-sdk/horizon.js')).horizon
        const submit = (await import('./include/stellar-js-worker-sdk/utils/submit.js')).default
        const signAsync = (await import('./include/noble/ed25519.js')).signAsync
        const xdr = (await import('./include/simple-xdr/xdr.js')).default
        horizon['utils']._scopes.submit = !!Object.assign(horizon['utils'], submit)
        horizon['utils'].ed25519 = { signAsync }
        horizon['utils']._scopes.xdr = !!(horizon['utils'].xdr = xdr)

        const url = new URL(request.url), path = url.pathname, params = Object.fromEntries(url.searchParams.entries())
        const [sectionId, resourceType, resourceId, resourceScope] = path.slice(1).split('/')

        const networks = {
            futurenet: { endpoint: 'https://horizon-futurenet.stellar.org', passphrase: 'Test SDF Future Network ; October 2022' },
            public: { endpoint: 'https://horizon.stellar.org', passphrase: 'Public Global Stellar Network ; September 2015' },
            test: { endpoint: 'https://horizon-testnet.stellar.org', passphrase: 'Test SDF Network ; September 2015' },
            custom: { endpoint: params.endpoint, passphrase: params.passphrase }
        }
        horizon['network'] = params.network ? networks[params.network] : networks.public
        delete params.endpoint
        delete params.passphrase
        delete params.network

        let result = {}

        switch (request.method) {
            case 'POST': case 'PUT':
                await horizon['utils'].xdr.import('https://cdn.jsdelivr.net/gh/cloudouble/stellar-js-worker-sdk@0.9.0/lib/stellar.xdr', 'stellar')
                const { transaction, keyPair } = await request.json()
                for await (const emitted of horizon['submit'](transaction, keyPair)) {
                    if (emitted.response) {
                        emitted.response = {
                            status: emitted.response.status, ok: emitted.response.ok, statusText: emitted.response.statusText,
                            headers: Object.fromEntries(emitted.response.headers.entries()),
                            body: await emitted.response[emitted.response.status <= 201 ? 'json' : 'text']()
                        }
                    }
                    delete emitted.signaturePayloadXdr
                    delete emitted.tx
                    Object.assign(result, emitted)
                }
                break
            default:
                result = await horizon[sectionId][resourceType](resourceId, resourceScope, params)
        }
        return new Response(JSON.stringify(result), { headers })
    },
};
