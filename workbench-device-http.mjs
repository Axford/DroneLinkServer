import { isIPv4 } from 'node:net';
import { FileError } from './workbench-files.mjs';

const maxResponseBytes = 8192;

function lanAddress(address) {
  if (!isIPv4(address)) return false;
  const [a, b] = address.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 169 && b === 254);
}

export async function readDeviceJson(fetchNode, address, path, { method, signal, headers }) {
  const response = await fetchNode(`http://${address}${path}`, {
    redirect: 'error', method, signal, headers,
  });
  if (response.status === 503 && method === 'GET') {
    await response.body?.cancel();
    return { status: 503 };
  }
  if (!response.ok) {
    await response.body?.cancel();
    const status = response.status;
    throw new FileError(status === 404 ? 503 : status === 409 ? 409 : 502,
      status === 404 ? 'This node firmware does not provide the requested diagnostic.' :
        status === 409 ? 'The node is busy with a recent diagnostic. Try again shortly.' : 'The device request failed.');
  }
  if (!/^application\/json\b/i.test(response.headers.get('content-type') ?? '') || !response.body) {
    await response.body?.cancel();
    throw new Error('Unexpected capability response');
  }
  const chunks = [];
  let bytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxResponseBytes) throw new Error('Capability response too large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return { status: response.status, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
}

export function deviceAddress(mesh, node, transport) {
  if (transport !== 'wifi') return;
  const route = mesh.fileRoute(node, transport).assertAvailable();
  if (route.nextHop === node && lanAddress(route.directHelloAddress)) return route.directHelloAddress;
}
