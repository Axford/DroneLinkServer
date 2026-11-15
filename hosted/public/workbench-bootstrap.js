'use strict';
const approve = document.getElementById('authorize');
const cancel = document.getElementById('cancel');
const status = document.getElementById('status');
const target = Object.fromEntries(new URLSearchParams(window.location.search));

cancel.addEventListener('click', () => {
    const callback = new URL('/workbench/authorized', 'http://127.0.0.1:' + Number(target.port));
    callback.search = new URLSearchParams({ state: target.state, cancelled: '1' });
    window.location.replace(callback.href);
});

approve.addEventListener('click', async () => {
    approve.disabled = cancel.disabled = true;
    status.textContent = 'Authorizing Workbench…';
    try {
        const session = await fetch('/api/session', { cache: 'no-store' });
        if (!session.ok) throw new Error('Sign in again, then reopen this page from Workbench.');
        const csrf = (await session.json()).data.csrfToken;
        const approval = await fetch('/api/workbench/bootstrap/approve', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify(target),
        });
        const result = await approval.json();
        if (!approval.ok) throw new Error(result.message || 'Could not authorize Workbench.');
        window.location.replace(result.data.callback);
    } catch (error) {
        status.textContent = error.message;
        approve.disabled = cancel.disabled = false;
    }
});
