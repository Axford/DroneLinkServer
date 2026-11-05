import { releaseStatus } from './release-state.mjs';
export function showReleaseWarning(root = document.body) {
  document.getElementById('release-warning')?.remove();
  document.getElementById('release-refresh')?.remove();
  if (!releaseStatus.warning && !releaseStatus.refreshRequired) return;
  const notice = document.createElement('div');
  notice.id = releaseStatus.warning ? 'release-warning' : 'release-refresh';
  notice.setAttribute('role', releaseStatus.warning ? 'alert' : 'status');
  notice.textContent = releaseStatus.warning || 'Gateway release changed. Save any unsaved edits, then refresh this page to use the selected release.';
  Object.assign(notice.style, { position: 'fixed', top: '0', left: '0', right: '0', padding: '10px', background: '#ffdc70', color: '#161616', zIndex: '100000', visibility: 'visible' });
  root.prepend(notice);
}
window.addEventListener('dronelink.release', () => showReleaseWarning());
showReleaseWarning();
