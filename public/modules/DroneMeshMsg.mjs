

import CRC8 from './CRC.mjs';
const crc8 = CRC8();

export const DRONE_MESH_MSG_HEADER_SIZE        = 7;

export const DRONE_MESH_MSG_MAX_PAYLOAD_SIZE   = 48; // bytes - to keep within RFM69 transmit size limit
export const DRONE_MESH_MSG_MAX_PACKET_SIZE    = (DRONE_MESH_MSG_HEADER_SIZE + DRONE_MESH_MSG_MAX_PAYLOAD_SIZE + 1 );  // header + payload + CRC

// buffer states
export const DRONE_MESH_MSG_BUFFER_STATE_EMPTY      =0;   // empty (or already sent)
export const DRONE_MESH_MSG_BUFFER_STATE_READY      =1;   // ready to send
export const DRONE_MESH_MSG_BUFFER_STATE_WAITING    =2;   // waiting for Ack

export const DRONE_MESH_MSG_SEND          =0;
export const DRONE_MESH_MSG_ACK           =1;

export const DRONE_MESH_MSG_NOT_GUARANTEED   =0;
export const DRONE_MESH_MSG_GUARANTEED       =0b01000000;

// Packet types
// -------------------------------------------------------------------------
export const DRONE_MESH_MSG_TYPE_HELLO                  =0;

export const DRONE_MESH_MSG_TYPE_SUBSCRIPTION_REQUEST   =1;
export const DRONE_MESH_MSG_TYPE_SUBSCRIPTION_RESPONSE  =2;

export const DRONE_MESH_MSG_TYPE_TRACEROUTE_REQUEST     =3;
export const DRONE_MESH_MSG_TYPE_TRACEROUTE_RESPONSE    =4;

export const DRONE_MESH_MSG_TYPE_ROUTEENTRY_REQUEST     =5;
export const DRONE_MESH_MSG_TYPE_ROUTEENTRY_RESPONSE    =6;

export const DRONE_MESH_MSG_TYPE_DRONELINKMSG           =7;

// batch firmware messages
export const DRONE_MESH_MSG_TYPE_FIRMWARE_START_REQUEST   =22;
export const DRONE_MESH_MSG_TYPE_FIRMWARE_START_RESPONSE  =23;
export const DRONE_MESH_MSG_TYPE_FIRMWARE_WRITE           =24;
export const DRONE_MESH_MSG_TYPE_FIRMWARE_REWIND          =25;
export const DRONE_MESH_MSG_TYPE_FIRMWARE_END_REQUEST     =26;
export const DRONE_MESH_MSG_TYPE_FIRMWARE_END_RESPONSE    =27;
// -------------------------------------------------------------------------

// Priorities
// -------------------------------------------------------------------------
export const DRONE_MESH_MSG_PRIORITY_LOW        =0;
export const DRONE_MESH_MSG_PRIORITY_MEDIUM     =1;
export const DRONE_MESH_MSG_PRIORITY_HIGH       =2;
export const DRONE_MESH_MSG_PRIORITY_CRITICAL   =3;
// -------------------------------------------------------------------------

// interface type codes
export const DRONE_MESH_INTERFACE_TYPE_UDP        =0;
export const DRONE_MESH_INTERFACE_TYPE_RFM69      =1;
export const DRONE_MESH_INTERFACE_TYPE_PTP        =2;  // point to point telemetry radio
export const DRONE_MESH_INTERFACE_TYPE_IRIDIUM    =3;


function constrain(v, minv, maxv) {
  return Math.max(Math.min(v, maxv), minv);
}


export class DroneMeshMsg {

  constructor(buffer) {
    this.typeGuaranteeSize = 0;
    this.txNode = 0;
    this.srcNode = 0;
    this.nextNode = 0;
    this.destNode = 0;
    this.seq = 0;
    this.priorityType = 0;
    this.isValid = true;

    this.rawPayload = new ArrayBuffer(DRONE_MESH_MSG_MAX_PAYLOAD_SIZE);
    this.uint8_tPayload = new Uint8Array(this.rawPayload);

    this.timestamp = Date.now();

    if (buffer) this.parse(buffer);
  }

  parse(rawBuffer) {
    var buffer = new Uint8Array(rawBuffer, 0);
    this.typeGuaranteeSize = buffer[0];
    this.txNode = buffer[1];
    this.srcNode = buffer[2];
    this.nextNode = buffer[3];
    this.destNode = buffer[4];
    this.seq = buffer[5];
    this.priorityType = buffer[6];
    this.crc = buffer[ this.getTotalSize()-1 ];

    for (var i=0; i < this.getPayloadSize(); i++) {
      this.uint8_tPayload[i] = buffer[DRONE_MESH_MSG_HEADER_SIZE+i];
    }

    // check CRC
    this.isValid = crc8.calc(rawBuffer, this.getTotalSize()-1) == this.crc;
  }

  isAck() {
    return this.getPacketType() > 0;
  }

  getPacketType() {
    return (this.typeGuaranteeSize >> 7);
  }

  setPacketType(t) {
    this.typeGuaranteeSize = (this.typeGuaranteeSize & 0b01111111) | (t << 7);
  }

  getPayloadSize() {
    return constrain( (this.typeGuaranteeSize & 0b00111111) + 1, 0, DRONE_MESH_MSG_MAX_PAYLOAD_SIZE);
  }

  getTotalSize() {
    return this.getPayloadSize() + DRONE_MESH_MSG_HEADER_SIZE + 1;
  }

  isGuaranteed() {
    return (this.typeGuaranteeSize & DRONE_MESH_MSG_GUARANTEED) > 0;
  }

  getPayloadType() {
    return this.priorityType & 0b00111111 ;
  }

  setPayloadType(t) {
    this.priorityType = (this.priorityType & 0b11000000) | t;
  }

  getPriority() {
    return this.priorityType >> 6;
  }

  setPriority(p) {
    this.priorityType = (this.priorityType & 0b00111111) | (p << 6)
  }

  setPriorityAndType(p,t) {
    this.priorityType = (p << 6) | t;
  }

  getTypeName() {
    switch(this.getPayloadType()) {
      case DRONE_MESH_MSG_TYPE_HELLO: return 'Hello';

      case DRONE_MESH_MSG_TYPE_SUBSCRIPTION_REQUEST: return 'Sub Req';
      case DRONE_MESH_MSG_TYPE_SUBSCRIPTION_RESPONSE: return 'Sub Resp';

      case DRONE_MESH_MSG_TYPE_TRACEROUTE_REQUEST: return 'Traceroute Req';
      case DRONE_MESH_MSG_TYPE_TRACEROUTE_RESPONSE: return 'Traceroute Resp';

      case DRONE_MESH_MSG_TYPE_ROUTEENTRY_REQUEST: return 'RoutingEntry Req';
      case DRONE_MESH_MSG_TYPE_ROUTEENTRY_RESPONSE: return 'RoutingEntry Resp';

      case DRONE_MESH_MSG_TYPE_DRONELINKMSG: return 'DLM';

      case DRONE_MESH_MSG_TYPE_FIRMWARE_START_REQUEST:  return 'Firmware Start Req';
      case DRONE_MESH_MSG_TYPE_FIRMWARE_START_RESPONSE:  return 'Firmware Start Resp';
      case DRONE_MESH_MSG_TYPE_FIRMWARE_WRITE:  return 'Firmware Write';
      case DRONE_MESH_MSG_TYPE_FIRMWARE_REWIND:  return 'Firmware Rewind';
      case DRONE_MESH_MSG_TYPE_FIRMWARE_END_REQUEST:  return 'Firmware End Req';
      case DRONE_MESH_MSG_TYPE_FIRMWARE_END_RESPONSE:  return 'Firmware End Resp'; 

    default:
      return '???';
    }
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
            (this.isAck() ? 'Ack' : 'S') + ', '+
            this.getTypeName() + ', p'+
            this.getPriority() +
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

    buffer[0] = this.typeGuaranteeSize;
		buffer[1] = this.txNode;
    buffer[2] = this.srcNode;
    buffer[3] = this.nextNode;
    buffer[4] = this.destNode;
    buffer[5] = this.seq;
    buffer[6] = this.priorityType;

    for (var i=0; i<this.getPayloadSize(); i++) {
      buffer[7+i] = this.uint8_tPayload[i];
    }

    buffer[buffer.length-1] = crc8.calc(buffer, this.getTotalSize()-1);
    return buffer;
  }



}
