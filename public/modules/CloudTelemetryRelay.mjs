// Process-owned cloud association. Local reception never depends on cloud availability.
export function createCloudTelemetryRelay({ domain, nodeAddress, url, credential, log = () => {}, accepted = () => {} }) {
  if (!url && !credential) return null;
  let endpoint;
  try {
    endpoint = new URL(url);
    if ((endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname))) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') throw Error();
    if (!domain || !Number.isInteger(nodeAddress) || nodeAddress < 1 || nodeAddress > 254 || !/^[A-Za-z0-9_-]{1,200}\.[A-Za-z0-9_-]{43}$/.test(credential)) throw Error();
  } catch { throw Error('Cloud relay requires a cloud origin, Domain and separate gateway credential'); }
  const states = new Map();
  let verified = false; let verifying;
  const post = (path, body) => fetch(new URL(path, endpoint).href, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + credential },
    body: JSON.stringify({ domain, id: nodeAddress, ...body }), redirect: 'error', signal: AbortSignal.timeout(5000)
  });
  async function verify() {
    if (verified) return;
    if (!verifying) verifying = (async () => {
      const response = await post('/gateway/verify', {});
      if (!response.ok) throw Error('Cloud association rejected: HTTP ' + response.status);
      const result = await response.json();
      if (result.data?.domainId !== domain || result.data?.nodeAddress !== nodeAddress || !result.data?.capabilities?.includes('telemetry')) throw Error('Cloud association does not match configured Domain/address');
      verified = true;
    })().finally(() => { verifying = undefined; });
    await verifying;
  }
  function drain(state) {
    state.running = Promise.resolve().then(async () => {
      while (state.latest !== null) {
        const next = state.latest; state.latest = null;
        if (state.sent === next) continue;
        try {
          await verify(); const response = await post('/addPacket', { packet: next });
          if (response.status !== 202) throw Error('Cloud telemetry rejected: HTTP ' + response.status);
          state.sent = next; accepted();
        } catch (error) { verified = false; log(error.message); }
      }
    }).finally(() => {
      state.running = null;
      if (state.latest !== null) return drain(state);
    });
    return state.running;
  }
  function send(message) {
    const packet = Buffer.from(message.encodeUnframed()).toString('base64');
    const signature = message.getSignature();
    let state = states.get(signature);
    if (!state) { state = { sent: null, latest: null, running: null }; states.set(signature, state); }
    if (!state.running && state.sent === packet) return Promise.resolve();
    state.latest = packet;
    return state.running || drain(state);
  }
  return { send, verify };
}
