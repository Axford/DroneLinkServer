'use strict';
const byId = id => document.getElementById(id);
async function request(path, options) {
    const response = await fetch(path, options);
    if (response.status === 401) throw new Error('Sign in again with the staging Admin account.');
    const body = await response.json();
    if (!response.ok) throw new Error(body.message);
    return body.data;
}
async function mutate(path, body, method = 'POST') {
    const { csrfToken } = await request('/api/session');
    return request(path, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body) });
}
function onSubmit(id, run) {
    const form = byId(id);
    const output = byId(id + '-result');
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const fields = Object.fromEntries(new FormData(form));
        const buttons = [...form.querySelectorAll('button')];
        buttons.forEach(button => { button.disabled = true; });
        output.textContent = '';
        try { await run(fields, event.submitter, output); }
        catch (error) { output.textContent = error.message; }
        finally { buttons.forEach(button => { button.disabled = false; }); }
    });
}
onSubmit('membership', async (fields, button, output) => {
    const domain = await request('/api/domains/' + encodeURIComponent(fields.domainId));
    const assigned = await mutate('/api/staging-test/memberships', { ...fields, revision: domain.revision });
    byId('issue').elements.name.value = fields.name;
    output.textContent = 'Assigned ' + assigned.role + ' in ' + domain.name + '.';
});
onSubmit('issue', async ({ name, recipient }, button, output) => {
    byId('code').value = '';
    byId('reference').value = '';
    const issued = await mutate('/api/staging-test/codes', { userId: 'staging-test-' + name, recipient });
    byId('code').value = issued.code;
    byId('reference').value = issued._id;
    byId('audit').elements.id.value = issued._id;
    output.textContent = 'Expires at ' + new Date(issued.codeExpiresAt).toLocaleTimeString() + '. Share privately.';
});
onSubmit('audit', async ({ id }, button, output) => {
    const path = '/api/staging-test/codes/' + encodeURIComponent(id);
    const record = button?.value === 'revoke' ? await mutate(path, {}, 'DELETE') : await request(path);
    if (record.revokedAt && byId('reference').value === id) byId('code').value = '';
    output.textContent = JSON.stringify(record, null, 2);
});
