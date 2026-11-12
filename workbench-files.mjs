import { createHash } from 'node:crypto';
import { dirname } from 'node:path/posix';
import * as FS from './public/modules/DroneMeshFS.mjs';
import { DroneLinkMsg } from './public/modules/droneLinkMsg.mjs';

const maxFileBytes = 8192;
const maxEntries = 64;
const blockSize = 32;
const scratchPath = '/backup.txt';
const responseTimeoutMs = 8000;
const operationTimeoutMs = 120000;
const managementChannel = 1;
const restartParameter = 10;

export class FileError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function validPath(path) {
  return typeof path === 'string' && path.length < FS.DRONE_MESH_MSG_FS_MAX_PATH_SIZE &&
    path.startsWith('/') && !/[^ -~]|\\/.test(path) &&
    (path === '/' || path.slice(1).split('/').every(part => part && part !== '.' && part !== '..'));
}

function filePath(path) {
  if (!validPath(path) || path === '/') throw new FileError(400, 'Invalid node file path.');
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readText(bytes) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    // The editor uses LF internally. Accept one line ending style so it can be preserved.
    const withoutCrlf = text.replaceAll('\r\n', '');
    if (text.includes('\0') || withoutCrlf.includes('\r') ||
        (text.includes('\r\n') && withoutCrlf.includes('\n'))) return null;
    return text;
  } catch {
    return null;
  }
}

class FileTransfer {
  constructor(route, node) {
    this.route = route;
    this.node = node;
    this.deadline = Date.now() + operationTimeoutMs;
  }

  async request(method, event, responseType, request, matches = () => true, deadline = this.deadline) {
    this.route.assertAvailable();
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new FileError(504, 'The node file operation timed out.');
    const { events, manager } = this.route;
    return new Promise((resolve, reject) => {
      const finish = (error, result) => {
        clearTimeout(timer);
        events.off(event, receive);
        if (error) reject(error);
        else resolve(result);
      };
      const receive = ({ node, payload }) => {
        if (node !== this.node) return;
        const reply = new responseType(payload);
        if (matches(reply)) finish(null, reply);
      };
      const timer = setTimeout(() => finish(new FileError(504, 'The node did not answer the file request.')), Math.min(remaining, responseTimeoutMs));
      events.on(event, receive);
      try {
        if (!manager[method]({ node: this.node, payload: request.encode() })) {
          finish(new FileError(503, 'The node request could not be queued.'));
        }
      } catch (error) {
        finish(error);
      }
    });
  }

  info(path, index, seen, directory = false) {
    const request = new FS.DroneMeshFSFileRequest();
    request.path = directory && path !== '/' ? `${path}/` : path;
    if (index !== undefined) {
      request.flags = FS.DRONE_MESH_MSG_FS_FLAG_INDEX_INFO;
      request.id = index;
    }
    return this.request('sendFSFileRequest', 'fs.file.response', FS.DroneMeshFSFileResponse, request, reply => {
      if (reply.flags === FS.DRONE_MESH_MSG_FS_FLAG_NOT_FOUND || reply.flags === FS.DRONE_MESH_MSG_FS_FLAG_ERROR) return true;
      if (index === undefined) return reply.path === request.path;
      if (reply.flags === FS.DRONE_MESH_MSG_FS_FLAG_DIRECTORY) reply.path = reply.path.replace(/\/$/, '');
      return validPath(reply.path) && dirname(reply.path) === path && !seen.has(reply.path);
    });
  }

  async list(path) {
    const dir = await this.info(path, undefined, undefined, true);
    if (dir.flags !== FS.DRONE_MESH_MSG_FS_FLAG_DIRECTORY) throw new FileError(404, 'The directory is unavailable on the node.');
    const seen = new Set();
    const entries = [];
    for (let index = 0; index < Math.min(dir.size, maxEntries); index++) {
      const entry = await this.info(path, index, seen, true);
      const directory = entry.flags === FS.DRONE_MESH_MSG_FS_FLAG_DIRECTORY;
      if (!directory && entry.flags !== FS.DRONE_MESH_MSG_FS_FLAG_FILE) throw new FileError(409, 'The directory changed. Refresh and try again.');
      seen.add(entry.path);
      entries.push({ path: entry.path, directory, bytes: directory ? undefined : entry.size });
    }
    return { path, entries, truncated: dir.size > maxEntries };
  }

  async read(path) {
    const entry = await this.info(path);
    if (entry.flags !== FS.DRONE_MESH_MSG_FS_FLAG_FILE) throw new FileError(404, 'The file is unavailable on the node.');
    if (entry.size < 0 || entry.size > maxFileBytes) throw new FileError(413, 'This file exceeds the 8 KiB editor limit.');
    const bytes = Buffer.alloc(entry.size);
    for (let offset = 0; offset < bytes.length; offset += blockSize) {
      const request = new FS.DroneMeshFSReadRequest();
      request.id = entry.id;
      request.offset = offset;
      const reply = await this.request('sendFSReadRequest', 'fs.read.response', FS.DroneMeshFSReadResponse, request,
        reply => reply.id === entry.id && reply.offset === offset);
      const expected = Math.min(blockSize, bytes.length - offset);
      if (reply.size !== expected) throw new FileError(409, 'The file changed or could not be read completely. Reopen it from the node.');
      bytes.set(reply.data.subarray(0, expected), offset);
    }
    return bytes;
  }

  manage(path, size, flags, expectedState, deadline) {
    const request = new FS.DroneMeshFSManageRequest();
    Object.assign(request, { path, size, flags });
    return this.request('sendFSManageRequest', 'fs.manage.response', FS.DroneMeshFSManageResponse, request,
      reply => reply.flags !== FS.DRONE_MESH_MSG_FS_FLAG_SUCCESS || reply.status === expectedState, deadline);
  }

  async assertScratchFree() {
    if ((await this.info(scratchPath)).flags !== FS.DRONE_MESH_MSG_FS_FLAG_NOT_FOUND) {
      throw new FileError(409, 'Upload is blocked because /backup.txt is occupied on the node.');
    }
  }

  async upload(path, revision, bytes) {
    await this.assertScratchFree();
    const original = await this.read(path);
    if (digest(original) !== revision) throw new FileError(409, 'The stored file changed after you opened it. Open it again before uploading.');
    if (readText(original) === null) throw new FileError(415, 'This file is outside the supported text format.');
    if (original.equals(bytes)) return original;

    let start;
    try {
      start = await this.manage(path, bytes.length, FS.DRONE_MESH_MSG_FS_FLAG_START, 1);
    } catch (error) {
      if (error.status !== 504) throw error;
      throw new FileError(504, 'The node did not confirm the upload started. Check its transfer state before retrying.');
    }
    if (start.flags !== FS.DRONE_MESH_MSG_FS_FLAG_SUCCESS) throw new FileError(409, 'The node refused to start the upload. Another transfer may be active.');
    try {
      for (let offset = 0; offset < bytes.length; offset += blockSize) {
        const request = new FS.DroneMeshFSWriteRequest();
        request.offset = offset;
        request.size = Math.min(blockSize, bytes.length - offset);
        request.data.set(bytes.subarray(offset, offset + request.size));
        const reply = await this.request('sendFSWriteRequest', 'fs.write.response', FS.DroneMeshFSWriteResponse, request,
          reply => reply.offset === offset);
        if (reply.flags !== FS.DRONE_MESH_MSG_FS_FLAG_SUCCESS) throw new FileError(502, 'The node rejected a file block.');
      }
      await this.assertScratchFree();
      if (!(await this.read(path)).equals(original)) throw new FileError(409, 'The stored file changed during upload. Open it again.');
    } catch (error) {
      const cancelled = await this.manage(path, bytes.length, FS.DRONE_MESH_MSG_FS_FLAG_CANCEL, 0, Date.now() + responseTimeoutMs)
        .then(reply => reply.flags === FS.DRONE_MESH_MSG_FS_FLAG_SUCCESS).catch(() => false);
      if (!cancelled) throw new FileError(502, 'The upload stopped before Save. The node did not confirm cancellation. Check its transfer state before retrying.');
      throw error;
    }

    try {
      // A lost Save response is resolved by reading the file, never by sending Save again.
      await this.manage(path, bytes.length, FS.DRONE_MESH_MSG_FS_FLAG_SAVE, 0).catch(() => {});
      const stored = await this.read(path);
      if (stored.equals(bytes)) return stored;
    } catch { /* The caller retains the draft and can check the node before retrying. */ }
    throw new FileError(502, 'Save could not be verified. Reopen the file and check /backup.txt before retrying.');
  }
}

export default class WorkbenchFiles {
  #active = new Set();
  #mesh;

  constructor(mesh) {
    this.#mesh = mesh;
  }

  async #onNode(address, transport, operation) {
    const node = Number(address);
    if (!/^[1-9]\d{0,2}$/.test(address) || node > 254 || !['wifi', 'serial'].includes(transport)) {
      throw new FileError(400, 'Select a valid node and local transport.');
    }
    if (this.#active.has(node)) throw new FileError(409, 'A file or restart operation is already running on this node.');
    if (this.#active.size >= 4) throw new FileError(503, 'The Workbench is busy with other nodes.');
    const route = this.#mesh.fileRoute(node, transport);
    this.#active.add(node);
    try { return await operation(new FileTransfer(route, node)); }
    finally { this.#active.delete(node); }
  }

  list(node, transport, path) {
    if (!validPath(path) || (path !== '/' && path.length + 1 >= FS.DRONE_MESH_MSG_FS_MAX_PATH_SIZE)) throw new FileError(400, 'Invalid node directory path.');
    return this.#onNode(node, transport, transfer => transfer.list(path));
  }

  read(node, transport, path) {
    filePath(path);
    return this.#onNode(node, transport, async transfer => {
      const bytes = await transfer.read(path);
      const text = readText(bytes);
      if (text === null) throw new FileError(415, 'This file is outside the supported text format.');
      return { path, text, revision: digest(bytes), editable: path !== scratchPath };
    });
  }

  upload(node, transport, { path, revision, text } = {}) {
    filePath(path);
    if (path === scratchPath) throw new FileError(400, '/backup.txt is reserved by the node and cannot be uploaded.');
    if (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision) || typeof text !== 'string') {
      throw new FileError(400, 'Open the current stored file before uploading.');
    }
    const bytes = Buffer.from(text, 'utf8');
    if (bytes.length < 1 || bytes.length > maxFileBytes) throw new FileError(413, 'Upload must contain 1 to 8192 bytes.');
    if (readText(bytes) !== text) throw new FileError(415, 'Upload requires valid UTF-8 text with consistent line endings.');
    return this.#onNode(node, transport, async transfer => {
      const stored = await transfer.upload(path, revision, bytes);
      return { path, text, revision: digest(stored), editable: true };
    });
  }

  restart(node, transport) {
    return this.#onNode(node, transport, transfer => {
      const { manager } = transfer.route;
      const route = transfer.route.assertAvailable();
      const request = new DroneLinkMsg();
      Object.assign(request, { source: manager.node, node: transfer.node, channel: managementChannel, param: restartParameter });
      request.setUint8([1]);
      if (!manager.generateDroneLinkMessage(route.netInterface, request, route.nextHop)) {
        throw new FileError(503, 'Restart could not be queued.');
      }
      return { status: 'queued' };
    });
  }
}
