
export const DRONE_MESH_ROUTER_SIZE = 13;


export class DroneMeshRouter {

  constructor(buffer) {
    this.txQueueSize = 0;
    this.txQueueActive = 0;
    this.kicked = 0;
    this.choked = 0;
    this.kickRate = 0;
    this.chokeRate = 0;
    this.utilisation = 0;

    this.timestamp = Date.now();

    if (buffer) this.parse(buffer);
  }

  parse(rawBuffer) {
    var buffer = new Uint8Array(rawBuffer, 0);
    this.txQueueSize = buffer[0];
    this.txQueueActive = buffer[1];
    this.kicked = (buffer[5] << 24) + (buffer[4] << 16) + (buffer[3] << 8) + buffer[2];
    this.choked = (buffer[9] << 24) + (buffer[8] << 16) + (buffer[7] << 8) + buffer[6];
    this.kickRate = buffer[10] / 10.0;
    this.chokeRate = buffer[11] / 10.0;
    this.utilisation = buffer[12] / 100.0;
  }

  toString() {
    // TODO
    return '';
  }


  encode() {
    // return Uint8Array
    var buffer = new Uint8Array(DRONE_MESH_ROUTER_SIZE);

    buffer[0] = this.txQueueSize;
    buffer[1] = this.txQueueActive;
    // little endian byte order
    buffer[5] = (this.kicked >> 24) & 0xFF;
    buffer[4] = (this.kicked >> 16) & 0xFF;
    buffer[3] = (this.kicked >> 8) & 0xFF;
    buffer[2] = (this.kicked) & 0xFF;
    // little endian byte order
    buffer[9] = (this.choked >> 24) & 0xFF;
    buffer[8] = (this.choked >> 16) & 0xFF;
    buffer[7] = (this.choked >> 8) & 0xFF;
    buffer[6] = (this.choked) & 0xFF;

    buffer[10] = Math.round(this.kickRate * 10);
    buffer[11] = Math.round(this.chokeRate * 10);
    buffer[12] = Math.round(this.utilisation * 100);

    return buffer;
  }



}
