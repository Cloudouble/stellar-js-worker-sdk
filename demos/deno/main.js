import { horizon } from 'https://cdn.jsdelivr.net/gh/cloudouble/stellar-js-worker-sdk@latest/horizon.js'
import submit from 'https://cdn.jsdelivr.net/gh/cloudouble/stellar-js-worker-sdk@latest/utils/submit.js'
import xdr from 'https://cdn.jsdelivr.net/gh/cloudouble/simple-xdr@1.2.4/xdr.min.js'
import { signAsync } from 'https://cdn.jsdelivr.net/npm/@noble/ed25519@2.1.0/+esm'
horizon.utils._scopes.submit = !!Object.assign(horizon.utils, submit)
horizon.utils._scopes.xdr = !!(horizon.utils.xdr = xdr)
horizon.utils.ed25519 = { signAsync }

const handler = async (request) => {

    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET,POST,DELETE,PUT,OPTIONS",
        "Access-Control-Max-Age": "86400",
        "Content-Type": "application/json",
        "Allow": "GET,POST,DELETE,PUT,OPTIONS",
    };

    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url), params = Object.fromEntries(Array.from(url.searchParams.entries()).filter(ent => !!ent[1])),
        path = url.pathname, [sectionId, resourceType, resourceId, resourceScope] = path.slice(1).split("/"), networks = {
            futurenet: { endpoint: 'https://horizon-futurenet.stellar.org', passphrase: 'Test SDF Future Network ; October 2022' },
            'public': { endpoint: 'https://horizon.stellar.org', passphrase: 'Public Global Stellar Network ; September 2015' },
            test: { endpoint: 'https://horizon-testnet.stellar.org', passphrase: 'Test SDF Network ; September 2015' },
            custom: { endpoint: params.endpoint, passphrase: params.passphrase }
        }
    horizon['network'] = params.network ? networks[params.network] : networks.public
    delete params.endpoint
    delete params.passphrase
    delete params.network

    let result = {};

    switch (request.method) {
        case "POST":
        case "PUT":
            await horizon.utils.xdr.import("https://cdn.jsdelivr.net/gh/cloudouble/stellar-js-worker-sdk@0.9.0/lib/stellar.xdr", "stellar");
            const { transaction, keyPair } = await request.json();
            for await (const emitted of horizon["submit"](transaction, keyPair)) {
                if (emitted.response) {
                    emitted.response = {
                        status: emitted.response.status,
                        ok: emitted.response.ok,
                        statusText: emitted.response.statusText,
                        headers: Object.fromEntries(emitted.response.headers.entries()),
                        body: await emitted.response[emitted.response.status <= 201 ? "json" : "text"](),
                    };
                }
                delete emitted.signaturePayloadXdr;
                delete emitted.tx;
                Object.assign(result, emitted);
            }
            break;
        default:
            result = await horizon[sectionId][resourceType](resourceId, resourceScope, params);
    }

    return new Response(JSON.stringify(result), { headers });
};
Deno.serve(handler);