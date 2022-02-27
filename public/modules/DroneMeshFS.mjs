
import * as DMM from './DroneMeshMsg.mjs';

export const DRONE_MESH_MSG_FS_MAX_PATH_SIZE       =24  // inc null termination

export const DRONE_MESH_MSG_FS_FLAG_PATH_INFO      =0;
export const DRONE_MESH_MSG_FS_FLAG_INDEX_INFO     =1;

export const DRONE_MESH_MSG_FS_FLAG_DIRECTORY      =4;
export const DRONE_MESH_MSG_FS_FLAG_FILE           =5;
export const DRONE_MESH_MSG_FS_FLAG_NOT_FOUND      =6;
export const DRONE_MESH_MSG_FS_FLAG_ERROR          =7;


// ----------------------------------------------------------------------------
// DRONE_MESH_MSG_FS_FILE_REQUEST
// ----------------------------------------------------------------------------
export const DRONE_MESH_MSG_FS_FILE_REQUEST_SIZE = DRONE_MESH_MSG_FS_MAX_PATH_SIZE + 2;

export class DroneMeshFSFileRequest {

  constructor(buffer) {
    this.flags = 0;
    this.id = 0;
    this.path = '';

    if (buffer) this.parse(buffer);
  }

  parse(rawBuffer) {
    var buffer = new Uint8Array(rawBuffer, 0);
    this.flags = buffer[0];
    this.id = buffer[1];
    // parse path
    this.path = '';
    var p = 2;
    for (var i=0; i<DRONE_MESH_MSG_FS_MAX_PATH_SIZE; i++) {
      if (buffer[p] > 0) {
        this.path += String.fromCharCode(buffer[p]);
      } else {
        break;
      }
      p++;
    }
  }

  toString() {
    return this.id + ') '+this.path + ' ['+this.flags+']';
  }


  encode() {
    // return Uint8Array
    var buffer = new Uint8Array(DRONE_MESH_MSG_FS_FILE_REQUEST_SIZE);

    buffer[0] = this.flags;
    buffer[1] = this.id;

    // encode path
    var p = 2;
    for (var i=0; i<this.path.length; i++) {
      buffer[p] = this.path.charCodeAt(i);
      p++;
    }
    // add a null
    buffer[p] = 0;

    return buffer;
  }

}


// ----------------------------------------------------------------------------
// DRONE_MESH_MSG_FS_FILE_RESPONSE
// ----------------------------------------------------------------------------
export const DRONE_MESH_MSG_FS_FILE_RESPONSE_SIZE = DRONE_MESH_MSG_FS_MAX_PATH_SIZE + 2 + 4;

export class DroneMeshFSFileResponse {

  constructor(buffer) {
    this.flags = 0;
    this.id = 0;
    this.size = 0;
    this.path = '';

    if (buffer) this.parse(buffer);
  }

  parse(rawBuffer) {
    var buffer = new Uint8Array(rawBuffer, 0);
    this.flags = buffer[0];
    this.id = buffer[1];
    // little endian byte order
    this.size = (buffer[5] << 24) + (buffer[4] << 16) + (buffer[3] << 8) + buffer[2];

    // parse path
    this.path = '';
    var p = 6;
    for (var i=0; i<DRONE_MESH_MSG_FS_MAX_PATH_SIZE; i++) {
      if (buffer[p] > 0) {
        this.path += String.fromCharCode(buffer[p]);
      } else {
        break;
      }
      p++;
    }
  }

  isDirectory() {
    return this.flags == DRONE_MESH_MSG_FS_FLAG_DIRECTORY;
  }

  toString() {
    return this.id + ') '+this.path + ' ['+this.flags+', size: '+this.size+']';
  }


  encode() {
    // return Uint8Array
    var buffer = new Uint8Array(DRONE_MESH_MSG_FS_FILE_RESPONSE_SIZE);

    buffer[0] = this.flags;
    buffer[1] = this.id;

    // little endian byte order
    buffer[5] = (this.size >> 24) & 0xFF;
    buffer[4] = (this.size >> 16) & 0xFF;
    buffer[3] = (this.size >> 8) & 0xFF;
    buffer[2] = (this.size) & 0xFF;

    // encode path
    var p = 6;
    for (var i=0; i<this.path.length; i++) {
      buffer[p] = this.path.charCodeAt(i);
      p++;
    }
    // add a null
    buffer[p] = 0;

    return buffer;
  }

}
