
export const DRONE_MESH_ROUTE_ENTRY_SIZE = 9;


export class DroneMeshRouteEntry {

  constructor(buffer) {
    this.node = 0;
    this.seq = 0;
    this.metric = 255;
    this.netInterface = 0;
    this.nextHop = 0;
    this.age = 0;

    this.timestamp = Date.now();

    if (buffer) this.parse(buffer);
  }

  parse(rawBuffer) {
    var buffer = new Uint8Array(rawBuffer, 0);
    this.node = buffer[0];
    this.seq = buffer[1];
    this.metric = buffer[2];
    this.netInterface = buffer[3];
    this.nextHop = buffer[4];
    this.age = (buffer[5] << 24) + (buffer[6] << 16) + (buffer[7] << 8) + buffer[8];
  }

  toString() {
    return this.node +
           ', seq=' + this.seq +
           ', metric=' +this.metric +
           ', int=' + this.netInterface +
           ', nextHop=' + this.nextHop +
           ', age=' + this.age
           ;
  }


  encode() {
    // return Uint8Array
    var buffer = new Uint8Array(DRONE_MESH_ROUTE_ENTRY_SIZE);

    buffer[0] = this.node;
		buffer[1] = this.seq;
    buffer[2] = this.metric;
    buffer[3] = this.netInteface;
    buffer[4] = this.nextHop;
    buffer[5] = (this.age >> 24) & 0xFF;
    buffer[6] = (this.age >> 16) & 0xFF;
    buffer[7] = (this.age >> 8) & 0xFF;
    buffer[8] = (this.age) & 0xFF;

    return buffer;
  }



}
