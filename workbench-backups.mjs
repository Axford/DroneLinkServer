import { createHash, randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const capacity = 128;
const retryLimitMs = 60000;

export default class WorkbenchBackups {
  #path;
  #send;
  #state;
  #timer;
  #closed = false;
  #running = false;
  #delay = 1000;
  #error = false;

  constructor(directory, scope, send) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const identity = createHash('sha256').update(JSON.stringify(scope)).digest('hex');
    this.#path = join(directory, identity + '.json');
    this.#send = send;
    try {
      this.#state = JSON.parse(readFileSync(this.#path, 'utf8'));
      if (!Array.isArray(this.#state.queue) || !Number.isSafeInteger(this.#state.sequence) ||
          !/^[a-f0-9-]{36}$/.test(this.#state.stream)) throw Error('Invalid backup queue');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.#state = { stream: randomUUID(), sequence: 0, queue: [] };
    }
    this.#schedule(0);
  }

  #persist(state) {
    const temporary = this.#path + '.' + randomUUID();
    try {
      const file = openSync(temporary, 'wx', 0o600);
      try {
        writeFileSync(file, JSON.stringify(state));
        fsyncSync(file);
      } finally { closeSync(file); }
      renameSync(temporary, this.#path);
      this.#state = state;
    } finally {
      try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }

  capture(node, file) {
    if (!file.editable) return 'excluded';
    const { path, text } = file;
    const { stream, sequence, queue } = this.#state;
    if (queue.length >= capacity) return 'not-queued';
    const entry = { nodeAddress: Number(node), path, text, capturedAt: new Date().toISOString(), stream, sequence: sequence + 1 };
    try { this.#persist({ stream, sequence: entry.sequence, queue: [...queue, entry] }); }
    catch { return 'not-queued'; }
    this.#schedule(0);
    return 'pending';
  }

  status(node) {
    return {
      pending: this.#state.queue.filter(entry => entry.nodeAddress === Number(node)).length,
      retrying: this.#error && this.#state.queue.length > 0,
    };
  }

  #schedule(delay) {
    if (this.#closed || this.#timer || this.#running || !this.#state.queue.length) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.#flush();
    }, delay);
  }

  async #flush() {
    const entry = this.#state.queue[0];
    this.#running = true;
    let delay = 0;
    try {
      if (!await this.#send(entry)) throw Error('Backup service rejected the snapshot');
      if (!this.#closed) this.#persist({ ...this.#state, queue: this.#state.queue.slice(1) });
      this.#delay = 1000;
      this.#error = false;
    } catch {
      delay = this.#delay;
      this.#delay = Math.min(this.#delay * 2, retryLimitMs);
      this.#error = true;
    } finally {
      this.#running = false;
      this.#schedule(delay);
    }
  }

  close() {
    this.#closed = true;
    clearTimeout(this.#timer);
  }
}
