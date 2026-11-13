import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import WorkbenchBackups from '../workbench-backups.mjs';

test('queued verified bytes survive restart and retry in order for the same gateway association', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workbench-backup-'));
  const scope = ['https://workbench.test', 'domain', 246, '127.0.0.1:8002'];
  let fail;
  const failed = new Promise(resolve => { fail = resolve; });
  const sent = [];
  const first = new WorkbenchBackups(directory, scope, async entry => {
    sent.push(entry);
    fail();
    return { ok: false };
  });
  let reopened;
  let different;
  try {
    assert.equal(first.capture(11, { path: '/backup.txt', text: 'scratch', editable: false }), 'excluded');
    assert.equal(first.capture(11, { path: '/config.ini', text: 'A\r\n', editable: true }), 'pending');
    assert.equal(first.capture(11, { path: '/config.ini', text: 'B\r\n', editable: true }), 'pending');
    await failed;
    await setImmediate();
    assert.deepEqual(first.status(11), { pending: 2, retrying: true });
    first.close();
    different = new WorkbenchBackups(directory, [...scope, 'other'], () => assert.fail('queue moved across scopes'));
    assert.equal(different.status(11).pending, 0);
    let finish;
    const delivered = new Promise(resolve => { finish = resolve; });
    reopened = new WorkbenchBackups(directory, scope, async entry => {
      sent.push(entry);
      if (entry.sequence === 2) finish();
      return { ok: true };
    });
    await delivered;
    await setImmediate();
    assert.equal(reopened.status(11).pending, 0);
    assert.deepEqual(sent[0], sent[1]);
    assert.deepEqual(sent.map(entry => [entry.sequence, entry.text]), [[1, 'A\r\n'], [1, 'A\r\n'], [2, 'B\r\n']]);
  } finally {
    first.close();
    reopened?.close();
    different?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
