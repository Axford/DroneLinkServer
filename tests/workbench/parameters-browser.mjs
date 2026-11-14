import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import dgram from 'node:dgram';
import { launch } from './harness.mjs';
import * as Mesh from '../../public/modules/DroneMeshMsg.mjs';
import * as Link from '../../public/modules/droneLinkMsg.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.DRONELINK_PLAYWRIGHT_MODULE || 'playwright');
const udp = dgram.createSocket('udp4');
udp.bind(0, '127.0.0.1');
await once(udp, 'listening');
const gateway = await launch(process.env.CLIENT_BUILD_DIR, undefined, undefined, { peerPort: udp.address().port });
let browser;
let value = 42;
let sequence = 10;
const requests = [];
function send(type, bytes, { seq = sequence++, destNode = 254, ack = false } = {}) {
  const packet = new Mesh.DroneMeshMsg();
  Object.assign(packet, { txNode: 11, srcNode: 11, nextNode: destNode, destNode, seq });
  packet.setPayloadType(type);
  packet.setPayloadSize(bytes.length);
  if (ack) packet.setPacketType(Mesh.DRONE_MESH_MSG_ACK);
  packet.uint8_tPayload.set(bytes);
  udp.send(packet.encode(), gateway.udpPort, '127.0.0.1');
}
const hello = () => send(Mesh.DRONE_MESH_MSG_TYPE_HELLO, [1, 1, 0, 0, 0], { destNode: 0 });
const report = () => send(Mesh.DRONE_MESH_MSG_TYPE_DRONELINKMSG, [11, 11, 5, 8, 0x80, value]);
udp.on('message', bytes => {
  const mesh = new Mesh.DroneMeshMsg(bytes);
  if (mesh.isAck() || mesh.destNode !== 11 || mesh.getPayloadType() !== Mesh.DRONE_MESH_MSG_TYPE_DRONELINKMSG) return;
  const link = new Link.DroneLinkMsg(new Uint8Array(mesh.rawPayload, 0, mesh.getPayloadSize()));
  if (link.channel !== 5 || link.param !== 8) return;
  requests.push(link.msgType);
  if (mesh.isGuaranteed()) send(mesh.getPayloadType(), [0], { seq: mesh.seq, ack: true });
  if (link.msgType === Link.DRONE_LINK_MSG_TYPE_UINT8_T) value = link.uint8_tPayload[0];
  if (link.msgType === Link.DRONE_LINK_MSG_TYPE_QUERY) report();
});
try {
  await gateway.ready;
  browser = await chromium.launch({ channel: process.env.DRONELINK_BROWSER_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  const timeout = { timeout: 10000 };
  await page.goto(gateway.origin + '/workbench/');
  await page.getByText('Local gateway connected', { exact: true }).waitFor(timeout);
  hello();
  await page.getByRole('button', { name: /Node 11 · Reachable/ }).click(timeout);
  report();
  const row = page.getByRole('article', { name: 'Parameter 11>5.8' });
  await row.getByRole('button', { name: 'Edit parameter value' }).click(timeout);
  const form = page.getByRole('dialog', { name: /Edit value/ });
  await form.getByRole('textbox', { name: 'Value 1' }).fill('43');
  const handle = form.getByLabel('Move editor with arrow keys');
  await handle.focus();
  await handle.press('ArrowDown');
  assert.equal(await form.evaluate(element => element.style.top), '100px');
  await page.getByRole('button', { name: 'Network', exact: true }).click();
  assert.equal(await form.getByRole('textbox', { name: 'Value 1' }).inputValue(), '43');
  await form.getByRole('button', { name: 'Submit write' }).click();
  await form.getByText('Newer observation matches').waitFor(timeout);
  assert.deepEqual(requests, [Link.DRONE_LINK_MSG_TYPE_UINT8_T, Link.DRONE_LINK_MSG_TYPE_QUERY]);
  assert.equal(value, 43);
  console.log(`PASS Chrome ${browser.version()}: movable non-modal draft, exact write and receipt-mediated readback`);
} finally {
  await browser?.close();
  await gateway.close();
  udp.close();
}
