// Generated from pinned DroneNode headers; package 0.2.0. Do not edit.
export const DRONE_LINK_SOURCE_OWNER = 0;
export const DRONE_LINK_CHANNEL_ALL = 0;
export const DRONE_LINK_PARAM_ALL = 0;
export const DRONE_LINK_MSG_MAX_PAYLOAD = 16;
export const DRONE_LINK_MSG_TYPE_UINT8_T = 0;
export const DRONE_LINK_MSG_TYPE_ADDR = 1;
export const DRONE_LINK_MSG_TYPE_UINT32_T = 2;
export const DRONE_LINK_MSG_TYPE_FLOAT = 3;
export const DRONE_LINK_MSG_TYPE_CHAR = 4;
export const DRONE_LINK_MSG_TYPE_NAME = 5;
export const DRONE_LINK_MSG_TYPE_NAMEQUERY = 6;
export const DRONE_LINK_MSG_TYPE_QUERY = 7;
export const DRONE_LINK_MSG_WRITABLE = 128;
export const DRONE_LINK_MSG_PRIORITY_LOW = 0;
export const DRONE_LINK_MSG_PRIORITY_MEDIUM = 1;
export const DRONE_LINK_MSG_PRIORITY_HIGH = 2;
export const DRONE_LINK_MSG_PRIORITY_CRITICAL = 3;
export const DRONE_MODULE_PARAM_STATUS = 1;
export const DRONE_MODULE_PARAM_NAME = 2;
export const DRONE_MODULE_PARAM_ERROR = 3;
export const DRONE_MODULE_PARAM_RESETCOUNT = 4;
export const DRONE_MODULE_PARAM_TYPE = 5;
export const DRONE_LINK_MSG_HEADER_BYTES = 5;
export const DRONE_LINK_MSG_TYPE_SIZES = [1, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
// Portable structural validation. Operational admission belongs to consumers.
export class ProtocolValidationError extends RangeError {
  constructor(code, field, offset) {
    super(`DroneLink ${code}${field ? ': '+field : ''}`);
    this.name='ProtocolValidationError';this.code=code;
    if(field!==undefined)this.field=field;
    if(offset!==undefined)this.offset=offset;
  }
}
export function integerField(value,min,max,field) {
  if(!Number.isSafeInteger(value)||value<min||value>max) throw new ProtocolValidationError('invalid-field',field);
  return value;
}
// No coercion for byte arrays; a view means its visible raw bytes, not its elements.
export function byteView(input) {
  if(Array.isArray(input)) {
    for(let i=0;i<input.length;i++)if(!Number.isInteger(input[i])||input[i]<0||input[i]>255)throw new ProtocolValidationError('invalid-input');
    return Uint8Array.from(input);
  }
  try {
    if(ArrayBuffer.isView(input)) return new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
    if(input instanceof ArrayBuffer) return new Uint8Array(input);
  } catch { throw new ProtocolValidationError('invalid-input'); }
  throw new ProtocolValidationError('invalid-input');
}
export function payloadLength(type,length) {
  integerField(type,0,7,'msgType');
  if(!Number.isInteger(length)||length<1||length>16) throw new ProtocolValidationError('invalid-length','payload');
  if(length%DRONE_LINK_MSG_TYPE_SIZES[type]) throw new ProtocolValidationError('misaligned-payload','payload');
}
export function readLinkPacket(input) {
  const view=byteView(input);
  if(view.length<6||view.length>21)throw new ProtocolValidationError('invalid-length','packet');
  const bytes=view.slice();const length=(bytes[4]&15)+1,type=(bytes[4]>>4)&7;
  if(bytes.length!==5+length)throw new ProtocolValidationError('invalid-length','packet');
  payloadLength(type,length);
  return {source:bytes[0],node:bytes[1],channel:bytes[2],param:bytes[3]&63,priority:bytes[3]>>6,
    msgType:type,msgLength:length,writable:!!(bytes[4]&128),payload:bytes.slice(5)};
}
export function encodeLinkPacket(fields,input) {
  for(const field of ['source','node','channel'])integerField(fields[field],0,255,field);
  integerField(fields.param,0,63,'param');integerField(fields.priority,0,3,'priority');
  payloadLength(fields.msgType,fields.msgLength);
  if(typeof fields.writable!=='boolean')throw new ProtocolValidationError('invalid-field','writable');
  const payload=byteView(input);
  if(payload.length!==fields.msgLength)throw new ProtocolValidationError('invalid-length','payload');
  return Uint8Array.from([fields.source,fields.node,fields.channel,(fields.priority<<6)|fields.param,
    (fields.writable?128:0)|(fields.msgType<<4)|(fields.msgLength-1),...payload]);
}
export function typedPayload(type,values) {
  if(!Array.isArray(values)&&(!ArrayBuffer.isView(values)||values instanceof DataView))throw new ProtocolValidationError('invalid-input','values');
  const count=values.length;
  integerField(type,0,7,'msgType');
  const length=type===1?count:count*DRONE_LINK_MSG_TYPE_SIZES[type];payloadLength(type,length);
  const bytes=new Uint8Array(length),view=new DataView(bytes.buffer);
  for(let i=0;i<count;i++) {
    const value=values[i];
    if(typeof value!=='number'||(type!==3&&(!Number.isInteger(value)||value<0||value>(type===2?0xffffffff:255))))throw new ProtocolValidationError('invalid-value','values');
    if(type===2)view.setUint32(i*4,value,true);
    else if(type===3)view.setFloat32(i*4,value,true);
    else bytes[i]=value;
  }
  return bytes;
}
export function textPayload(text) {
  if(typeof text!=='string')throw new ProtocolValidationError('invalid-text');
  if(text.length>16)throw new ProtocolValidationError('invalid-length','text');
  if(!text.length)return Uint8Array.of(0);
  const bytes=new Uint8Array(text.length);
  for(let i=0;i<text.length;i++) {const code=text.charCodeAt(i);if(code>255)throw new ProtocolValidationError('invalid-text');bytes[i]=code;}
  return bytes;
}
export function readLinkLog(input) {
  const record=byteView(input);
  if(record.length<11||record.length>26||record[0]!==record.length)throw new ProtocolValidationError('invalid-log-record');
  const packet=readLinkPacket(record.subarray(5));
  const timestamp=new DataView(record.buffer,record.byteOffset,record.byteLength).getUint32(1,false);
  return {...packet,timestamp};
}
export function encodeLinkLog(fields,payload,timestamp) {
  integerField(timestamp,0,Number.MAX_SAFE_INTEGER,'timestamp');
  const packet=encodeLinkPacket(fields,payload);const bytes=new Uint8Array(packet.length+5);
  bytes[0]=bytes.length;new DataView(bytes.buffer).setUint32(1,timestamp>>>0,false);bytes.set(packet,5);return bytes;
}
