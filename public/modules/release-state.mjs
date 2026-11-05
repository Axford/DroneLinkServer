/** Failure-aware catalog and reconnect status; imports never reject for missing metadata. */
let initial;
const catalog = {};
try {
  const response = await fetch('/release-status', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error('Gateway release status unavailable');
  initial = await response.json();
  if (initial.available) {
    const metadata = await fetch('/moduleInfo.json', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!metadata.ok) throw new Error('Module metadata unavailable');
    Object.assign(catalog, await metadata.json());
  }
} catch (error) {
  initial = { available: false, warning: `${error.message}. Firmware distribution, module metadata and generated help are unavailable.` };
}
export const releaseStatus = { ...initial };
export let metadataAvailable = initial.available;
export let unavailableMessage = initial.warning || 'Module metadata unavailable';
const controls = new Set();
function updateControl(node) {
  node.disabled = !metadataAvailable;
  node.setAttribute('aria-disabled', String(!metadataAvailable));
  node.title = metadataAvailable ? '' : unavailableMessage;
}
export function metadataRequired(element) {
  const node = element?.jquery ? element[0] : element;
  if (node) { controls.add(node); updateControl(node); }
  return metadataAvailable;
}
export function applyGatewayStatus(next) {
  if (!releaseStatus.refreshRequired && next.available === initial.available && next.identity === initial.identity && next.warning === initial.warning) return;
  // Never hot-swap catalog/UI built against an earlier process's release. Keep
  // unsaved drafts in place and require a deliberate browser refresh to adopt.
  metadataAvailable = false;
  for (const name of Object.keys(catalog)) delete catalog[name];
  Object.assign(releaseStatus, next, { refreshRequired: true });
  unavailableMessage = next.available ? 'Gateway release changed. Refresh this page to use it; save any unsaved edits first.' : next.warning;
  for (const node of controls) {
    if (node.isConnected) updateControl(node); else controls.delete(node);
  }
  // Existing metadata editors must not remain usable with stale definitions.
  for (const panel of document.querySelectorAll('.graphEditorPanel, .wizardPanel')) {
    panel.hidden = true;
    for (const control of panel.querySelectorAll('button,input,select,textarea')) control.disabled = true;
  }
  window.dispatchEvent(new CustomEvent('dronelink.release'));
}
export default catalog;
