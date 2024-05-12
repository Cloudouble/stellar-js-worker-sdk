import { horizon } from '../horizon.js'
import submit from '../utils/submit.js'
import xdr from 'https://cdn.jsdelivr.net/gh/cloudouble/simple-xdr@1.2.4/xdr.min.js'
import { signAsync } from 'https://cdn.jsdelivr.net/npm/@noble/ed25519@2.1.0/+esm'

horizon.utils._scopes.submit = !!Object.assign(horizon.utils, submit)
horizon.utils._scopes.xdr = !!(horizon.utils.xdr = xdr)
horizon.utils.ed25519 = { signAsync }

const getStellarResponse = async (input) => {
    const { sectionId, resourceType, resourceId, resourceScope, params, network, keyPair, transaction } = input
    if (network) Object.assign(horizon.network, network)
    if (transaction && keyPair) {
        let result = {}
        for await (const emitted of horizon.submit(transaction, keyPair)) {
            if (emitted.response) {
                emitted.response = {
                    status: emitted.response.status, ok: emitted.response.ok, statusText: emitted.response.statusText,
                    headers: Object.fromEntries(emitted.response.headers.entries()),
                    body: await emitted.response[emitted.response.status <= 201 ? 'json' : 'text']()
                }
            }
            Object.assign(result, emitted)
        }
        return result
    }
    return await horizon[sectionId][resourceType](resourceId, resourceScope, params)
}
self.addEventListener('message', async event => event.source.postMessage({ result: await getStellarResponse(event.data) }))
