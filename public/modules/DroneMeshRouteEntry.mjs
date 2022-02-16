
export const DRONE_MESH_ROUTE_ENTRY_SIZE = 16;


export class DroneMeshRouteEntry {

  constructor(buffer) {
    this.src = 0;
    this.node = 0;
    this.seq = 0;
    this.metric = 255;
    this.netInterface = 0;
    this.nextHop = 0;
    this.age = 0;
    this.uptime = 0;
    this.avgAttempts = 0;
    this.avgAckTime = 0;
    this.avgTxTime = 0;
    this.avgAckTime = 0;
    this.interfaceAddress = null;

    this.timestamp = Date.now();

    if (buffer) this.parse(buffer);
  }

  parse(rawBuffer) {
    var buffer = new Uint8Array(rawBuffer, 0);
    this.src = buffer[0];
    this.node = buffer[1];
    this.seq = buffer[2];
    this.metric = buffer[3];
    this.netInterface = buffer[4];
    this.nextHop = buffer[5];
    // little endian byte order
    this.age = (buffer[9] << 24) + (buffer[8] << 16) + (buffer[7] << 8) + buffer[6];
    // little endian byte order
    this.uptime = (buffer[13] << 24) + (buffer[12] << 16) + (buffer[11] << 8) + buffer[10];
    this.avgAttempts = (buffer[14] / 10);
    this.avgAckTime = buffer[15];
  }

  toString() {
    return this.src + ' --> ' + this.node +
           ', seq=' + this.seq +
           ', metric=' +this.metric +
           ', int=' + this.netInterface +
           ', nextHop=' + this.nextHop +
           ', age=' + (this.age/1000).toFixed(1) + 's' +
           ', uptime=' + (this.uptime/1000).toFixed(1) + 's' +
           ', avgAttempts='+(this.avgAttempts.toFixed(1)) +
           ', avgTxTime=' + this.avgAckTime
           ;
  }


  encode() {
    // return Uint8Array
    var buffer = new Uint8Array(DRONE_MESH_ROUTE_ENTRY_SIZE);

    buffer[0] = this.src;
    buffer[1] = this.node;
		buffer[2] = this.seq;
    buffer[3] = this.metric;
    buffer[4] = this.netInterface;
    buffer[5] = this.nextHop;
    // little endian byte order
    buffer[9] = (this.age >> 24) & 0xFF;
    buffer[8] = (this.age >> 16) & 0xFF;
    buffer[7] = (this.age >> 8) & 0xFF;
    buffer[6] = (this.age) & 0xFF;
    // little endian byte order
    buffer[13] = (this.uptime >> 24) & 0xFF;
    buffer[12] = (this.uptime >> 16) & 0xFF;
    buffer[11] = (this.uptime >> 8) & 0xFF;
    buffer[10] = (this.uptime) & 0xFF;

    buffer[14] = Math.round(this.avgAttempts * 10);
    buffer[15] = this.avgAckTime;

    return buffer;
  }



}
