

import CRC8 from './CRC.mjs';
const crc8 = CRC8();

export const DRONE_MESH_MSG_HEADER_SIZE        = 7;

export const DRONE_MESH_MSG_MAX_PAYLOAD_SIZE   = 48; // bytes - to keep within RFM69 transmit size limit
export const DRONE_MESH_MSG_MAX_PACKET_SIZE    = (DRONE_MESH_MSG_HEADER_SIZE + DRONE_MESH_MSG_MAX_PAYLOAD_SIZE + 1 );  // header + payload + CRC

// buffer states
export const DRONE_MESH_MSG_BUFFER_STATE_EMPTY      =0;   // empty (or already sent)
export const DRONE_MESH_MSG_BUFFER_STATE_READY      =1;   // ready to send
export const DRONE_MESH_MSG_BUFFER_STATE_WAITING    =2;   // waiting for Ack


export const DRONE_MESH_MSG_MODE_UNICAST     =0;
export const DRONE_MESH_MSG_MODE_MULTICAST   =0b10000000;

export const DRONE_MESH_MSG_NOT_GUARANTEED   =0;
export const DRONE_MESH_MSG_GUARANTEED       =0b01000000;

export const DRONE_MESH_MSG_TYPE_HELLO          =(0 << 1);
export const DRONE_MESH_MSG_TYPE_SUBSCRIPTION   =(1 << 1);
export const DRONE_MESH_MSG_TYPE_TRACEROUTE     =(2 << 1);
export const DRONE_MESH_MSG_TYPE_ROUTEENTRY     =(3 << 1);
export const DRONE_MESH_MSG_TYPE_DRONELINKMSG   =(4 << 1);

export const DRONE_MESH_MSG_REQUEST          =0;
export const DRONE_MESH_MSG_RESPONSE         =1;


function constrain(v, minv, maxv) {
  return Math.max(Math.min(v, maxv), minv);
}


export class DroneMeshMsg {

  constructor(buffer) {
    this.modeGuaranteeSize = 0;
    this.txNode = 0;
    this.srcNode = 0;
    this.nextNode = 0;
    this.destNode = 0;
    this.seq = 0;
    this.typeDir = 0;
    this.isValid = true;

    this.rawPayload = new ArrayBuffer(DRONE_MESH_MSG_MAX_PAYLOAD_SIZE);
    this.uint8_tPayload = new Uint8Array(this.rawPayload);

    this.timestamp = Date.now();

    if (buffer) this.parse(buffer);
  }

  parse(rawBuffer) {
    var buffer = new Uint8Array(rawBuffer, 0);
    this.modeGuaranteeSize = buffer[0];
    this.txNode = buffer[1];
    this.srcNode = buffer[2];
    this.nextNode = buffer[3];
    this.destNode = buffer[4];
    this.seq = buffer[5];
    this.typeDir = buffer[6];
    this.crc = buffer[ this.getTotalSize()-1 ];

    for (var i=0; i < this.getPayloadSize(); i++) {
      this.uint8_tPayload[i] = buffer[DRONE_MESH_MSG_HEADER_SIZE+i];
    }

    // check CRC
    this.isValid = crc8.calc(rawBuffer, this.getTotalSize()-1) == this.crc;
  }

  getMode() {
    return this.modeGuaranteeSize & 0b10000000;
  }

  isUnicast() {
    return this.getMode() == DRONE_MESH_MSG_MODE_UNICAST;
  }

  getPayloadSize() {
    return constrain( (this.modeGuaranteeSize & 0b00111111) + 1, 0, DRONE_MESH_MSG_MAX_PAYLOAD_SIZE);
  }

  getTotalSize() {
    return this.getPayloadSize() + DRONE_MESH_MSG_HEADER_SIZE + 1;
  }

  isGuaranteed() {
    return (this.modeGuaranteeSize & DRONE_MESH_MSG_GUARANTEED) > 0;
  }

  getType() {
    return this.typeDir & 0b11111110;
  }

  getTypeName() {
    switch(this.getType()) {
      case DRONE_MESH_MSG_TYPE_HELLO: return 'Hello';
      case DRONE_MESH_MSG_TYPE_SUBSCRIPTION: return 'Sub';
      case DRONE_MESH_MSG_TYPE_TRACEROUTE: return 'Traceroute';
      case DRONE_MESH_MSG_TYPE_ROUTEENTRY: return 'RoutingEntry';
      case DRONE_MESH_MSG_TYPE_DRONELINKMSG: return 'DLM';
    }
  }

  getDirection() {
    return this.typeDir & 0b1;
  }

  isRequest() {
    return (this.getDirection() == DRONE_MESH_MSG_REQUEST);
  }

  payloadToString() {
    var s = '';
    for (var i=0; i<this.getPayloadSize(); i++) {
      s +=  this.uint8_tPayload[i] + ' ';
    }
    return s;
  }


  toString() {
    return '(' +
            (this.isUnicast() ? 'U' : 'M') + ', '+
            (this.isRequest() ? 'Req' : 'Res') +', '+
            this.getTypeName() +
           ') '+
           this.srcNode + ' > ' +
           this.txNode + ' > ' +
           this.nextNode + ' > ' +
           this.destNode + ' seq=' +
           this.seq +
           ' [' +
           this.getPayloadSize() +
           ']  ' +
           this.payloadToString()
           ;
  }


  encode() {
    // return Uint8Array
    var buffer = new Uint8Array(this.getTotalSize());

    buffer[0] = this.modeGuaranteeSize;
		buffer[1] = this.txNode;
    buffer[2] = this.srcNode;
    buffer[3] = this.nextNode;
    buffer[4] = this.destNode;
    buffer[5] = this.seq;
    buffer[6] = this.typeDir;

    for (var i=0; i<this.getPayloadSize(); i++) {
      buffer[7+i] = this.uint8_tPayload[i];
    }

    buffer[buffer.length-1] = crc8.calc(buffer, this.getTotalSize()-1);
    return buffer;
  }



}
