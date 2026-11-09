// Import diagnostics remain visible while the usable prefix is played.
export function showLogImportStatus(report, id, document = globalThis.document) {
  let element = document.getElementById(id);
  if (!element) {
    element = document.createElement('p'); element.id = id;
    element.setAttribute('role', 'alert'); element.style.cssText = 'padding:12px;background:#553c00;color:white;position:relative;z-index:1000';
    document.body.prepend(element);
  }
  element.hidden = report.complete;
  element.textContent = report.complete ? '' : `Partial log import: ${report.imported} valid records, ${report.skipped} invalid records skipped` +
    (report.stoppedAt === null ? '.' : `; stopped at byte ${report.stoppedAt}.`);
}
