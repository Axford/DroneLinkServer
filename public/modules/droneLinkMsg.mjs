import { ProtocolValidationError, readLinkPacket, readLinkLog, encodeLinkPacket, encodeLinkLog, typedPayload, textPayload, integerField } from './vendor/protocol-0.2.0.mjs';
export { ProtocolValidationError } from './vendor/protocol-0.2.0.mjs';
import CRC8 from './CRC.mjs';
const crc8 = CRC8();

import {
  DRONE_LINK_SOURCE_OWNER,
  DRONE_LINK_MSG_TYPE_UINT8_T,
  DRONE_LINK_MSG_TYPE_ADDR,
  DRONE_LINK_MSG_TYPE_UINT32_T,
  DRONE_LINK_MSG_TYPE_FLOAT,
  DRONE_LINK_MSG_TYPE_CHAR,
  DRONE_LINK_MSG_TYPE_NAME,
  DRONE_LINK_MSG_TYPE_NAMEQUERY,
  DRONE_LINK_MSG_TYPE_QUERY,
  DRONE_LINK_MSG_WRITABLE,
  DRONE_MODULE_PARAM_STATUS,
  DRONE_MODULE_PARAM_NAME,
  DRONE_MODULE_PARAM_ERROR,
  DRONE_MODULE_PARAM_RESETCOUNT,
  DRONE_MODULE_PARAM_TYPE,
  DRONE_LINK_MSG_TYPE_SIZES,
  DRONE_LINK_MSG_PRIORITY_LOW,
  DRONE_LINK_MSG_PRIORITY_MEDIUM,
  DRONE_LINK_MSG_PRIORITY_HIGH,
  DRONE_LINK_MSG_PRIORITY_CRITICAL,
  DRONE_LINK_MSG_MAX_PAYLOAD,
  DRONE_LINK_MSG_HEADER_BYTES
} from './vendor/protocol-0.2.0.mjs';

export {
  DRONE_LINK_SOURCE_OWNER,
  DRONE_LINK_MSG_TYPE_UINT8_T,
  DRONE_LINK_MSG_TYPE_ADDR,
  DRONE_LINK_MSG_TYPE_UINT32_T,
  DRONE_LINK_MSG_TYPE_FLOAT,
  DRONE_LINK_MSG_TYPE_CHAR,
  DRONE_LINK_MSG_TYPE_NAME,
  DRONE_LINK_MSG_TYPE_NAMEQUERY,
  DRONE_LINK_MSG_TYPE_QUERY,
  DRONE_LINK_MSG_WRITABLE,
  DRONE_MODULE_PARAM_STATUS,
  DRONE_MODULE_PARAM_NAME,
  DRONE_MODULE_PARAM_ERROR,
  DRONE_MODULE_PARAM_RESETCOUNT,
  DRONE_MODULE_PARAM_TYPE,
  DRONE_LINK_MSG_TYPE_SIZES,
  DRONE_LINK_MSG_PRIORITY_LOW,
  DRONE_LINK_MSG_PRIORITY_MEDIUM,
  DRONE_LINK_MSG_PRIORITY_HIGH,
  DRONE_LINK_MSG_PRIORITY_CRITICAL,
  DRONE_LINK_MSG_MAX_PAYLOAD,
  DRONE_LINK_MSG_HEADER_BYTES
};

export const DRONE_LINK_MSG_TYPE_NAMES = [
  'u8',
  'a',
  'u32',
  'f',
  'c',
  'n',
  'nq',
  'q'
];

export function sendDroneLinkMsg(msgObj) {
	/*
	msgObj of form:
	{
		addr: ,
		msgType: ,
		values: [ v ]
	}

	*/

	//console.log('sendDroneLinkMsg', msgObj)

	fetch('send', {
		method: 'post',
		headers: {
			'Accept': 'application/json, text/plain, */*',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(msgObj)
	})
}



export class DroneLinkMsg {
  constructor(buffer) {
		this.source = 0;
    this.node = 0;
    this.channel = 0;
    this.param = 0;
    this.priority = DRONE_LINK_MSG_PRIORITY_LOW;
    this.msgType = 0;
    this.msgLength = 0;
    this.writable = false;
    this.rawPayload = new ArrayBuffer(DRONE_LINK_MSG_MAX_PAYLOAD);
    this.uint8_tPayload = new Uint8Array(this.rawPayload);
    this.values = [];
    this.timestamp = Date.now();

    if (buffer !== undefined) this.parse(buffer);
  }

  totalSize() {
    return DRONE_LINK_MSG_HEADER_BYTES + this.msgLength;
  }

  assignDecoded(packet) {
    const {payload, ...fields}=packet;
    this.uint8_tPayload.fill(0);this.uint8_tPayload.set(payload);
    Object.assign(this,fields);
  }

  replacePayload(type, bytes, resetWritable = true) {
    this.uint8_tPayload.fill(0);this.uint8_tPayload.set(bytes);
    this.msgType=type;this.msgLength=bytes.length;
    if(resetWritable)this.writable=false;
  }

  getSignature() {
    return this.node + '>' + this.channel + '.' + this.param + '_' + this.msgType;
  }

	sameSignature(msg) {
    if (msg == undefined) return false;

  // returns true if channel, param and type match
    return (this.source == msg.source) &&
           (this.node == msg.node) &&
           (this.channel == msg.channel) &&
           (this.param == msg.param) &&
           (this.msgType == msg.msgType);
  }

	sameAddress(msg) {
    if (msg == undefined) return false;

  // returns true if channel, param and type match
    return (this.node == msg.node) &&
           (this.channel == msg.channel) &&
           (this.param == msg.param);
  }

	addressAsString() {
		return this.source + ':' + this.node + '>' + this.channel + '.' + this.param;
	}

  asString() {
    return this.addressAsString() + ' ('+DRONE_LINK_MSG_TYPE_NAMES[this.msgType]+ (this.writable ? ',W':'') +')=' + this.payloadToString();
  }

  parse(rawBuffer) {
    this.assignDecoded(readLinkPacket(rawBuffer));
  }

  parseFromLog(buffer) {
    this.assignDecoded(readLinkLog(buffer));
  }

  copy(msg) {
    const packet=readLinkPacket(msg.encodeUnframed());
    this.assignDecoded(packet);
  }

	setUint8(values) {
    this.replacePayload(0,typedPayload(0,values));
  }

  setUint32(values) {
    this.replacePayload(2,typedPayload(2,values));
  }

  setFloat(values) {
    this.replacePayload(3,typedPayload(3,values));
  }
  
  setAddr(values) {
    this.replacePayload(1,typedPayload(1,values));
  }

	parseAddress(addr) {
    if(typeof addr!=='string'||!/^\d+>\d+\.\d+$/.test(addr))throw new ProtocolValidationError('invalid-field','address');
    const [node,channel,param]=addr.split(/[>.]/).map(Number);
    integerField(node,0,255,'node');integerField(channel,0,255,'channel');integerField(param,0,63,'param');
    return {node,channel,param};
  }

	setAddress(addr) {
		var a = this.parseAddress(addr);
    this.node = a.node;
		this.channel = a.channel;
		this.param = a.param;
  }

  setPriority(p) {
    this.priority=integerField(p,0,3,'priority');
  }

  setString(s) {
    this.replacePayload(4,textPayload(s),false);
  }

	setName(s) {
    this.replacePayload(5,textPayload(s),false);
  }

  encode() {
    const payload = this.encodeUnframed();
    const frame = new Uint8Array(payload.length + 2);
    frame[0] = 0xFE;
    frame.set(payload, 1);
    frame[frame.length - 1] = crc8.calc(payload, payload.length);
    return frame;
  }

	encodeUnframed() {
    return encodeLinkPacket(this,this.uint8_tPayload.subarray(0,this.msgLength));
  }

  getLogEncodingSize() {
    return this.msgLength + 5 + 4 + 1;
  }

  encodeForLog() {
    return encodeLinkLog(this,this.uint8_tPayload.subarray(0,this.msgLength),this.timestamp);
  }

  // returns true if values in this message match those of msg
  valuesEqual(msg) {
    var a = this.valueArray();
    var b = msg.valueArray();
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length !== b.length) return false;

    // If you don't care about the order of the elements inside
    // the array, you should sort both arrays here.
    // Please note that calling sort on an array will modify that array.
    // you might want to clone your array first.

    for (var i = 0; i < a.length; ++i) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

	bytesPerValue() {
    return DRONE_LINK_MSG_TYPE_SIZES[this.msgType];
  }

  numValues() {
    return this.msgLength / this.bytesPerValue();
  }

  payloadAsFloat() {
    let floatView = new Float32Array(this.rawPayload, 0, this.msgLength/4);
    return floatView;
  }

  valueArray() {
    const numValues = this.numValues();
    var valueView = [];
    if (this.msgType == DRONE_LINK_MSG_TYPE_UINT8_T) {
      var temp = new Uint8Array(this.rawPayload, 0, numValues);
      temp.forEach((v)=>{ valueView.push(v)} );

    } else if (this.msgType == DRONE_LINK_MSG_TYPE_ADDR) {
      var temp = new Uint8Array(this.rawPayload, 0, this.msgLength);
      valueView = Array.from(temp);

    } else if (this.msgType == DRONE_LINK_MSG_TYPE_UINT32_T) {
      var temp = Array.from({length:numValues},(_,i)=>new DataView(this.rawPayload).getUint32(i*4,true));
      valueView = Array.from(temp);
      //console.log("u32", valueView);

    } else if (this.msgType == DRONE_LINK_MSG_TYPE_FLOAT) {
      valueView = Float32Array.from(Array.from({length:numValues},(_,i)=>new DataView(this.rawPayload).getFloat32(i*4,true)));
      //console.log("F", valueView);

    } else if (this.msgType == DRONE_LINK_MSG_TYPE_CHAR) {
      valueView = [ this.payloadToString() ];
    }
    return valueView;
  }

  trimNull(a) {
    var c = a.indexOf('\0');
    if (c>-1) {
      return a.substr(0, c);
    }
    return a;
  }

  payloadToString() {
    var s = '';
    //console.log(this.msgType);
    if (this.msgType == DRONE_LINK_MSG_TYPE_CHAR || this.msgType == DRONE_LINK_MSG_TYPE_NAME) {
      for (var i=0; i<this.msgLength; i++) {
        s += String.fromCharCode(this.uint8_tPayload[i]);
      }
    } else {
      for (var i=0; i<this.msgLength; i++) {
        s += this.uint8_tPayload[i].toString(16) + ' ';
      }
    }

    return this.trimNull(s);
  }

  payloadAsFloat() {
    let floatView = new Float32Array(this.rawPayload, 0, this.msgLength/4);
    return floatView;
  }

  store(writeApi, Point, paramName) {
    const numValues = this.numValues();

    var doWrite = false;

    const addr = this.node + '>' + this.channel + '.' + this.param;

    // save this message to the InfluxDB
    const point = new Point(addr)
      //.tag('node', this.node)
      //.tag('channel', this.channel)
      //.tag('param', this.param)
      .tag('addr', addr)
      .tag('type', this.msgType)
      //.tag('writable', this.writable)
      .tag('name', paramName)
      //.intField('length',this.msgLength)
      .intField('num', numValues);

    if (this.msgType == DRONE_LINK_MSG_TYPE_UINT8_T ||
        this.msgType == DRONE_LINK_MSG_TYPE_ADDR) {
      for (var i=0; i<numValues; i++) {
        point.intField('value'+i, this.uint8_tPayload[i]);
      }
      doWrite = true;

    } else if (this.msgType == DRONE_LINK_MSG_TYPE_UINT32_T) {
      let int32view = Array.from({length:numValues},(_,i)=>new DataView(this.rawPayload).getUint32(i*4,true));
      for (var i=0; i<numValues; i++) {
        var uv = int32view[i];
        if (uv == undefined) uv = 0;
        point.intField('value'+i, uv);
      }
      doWrite = true;

    } else if (this.msgType == DRONE_LINK_MSG_TYPE_FLOAT) {
      let floatView = Float32Array.from(Array.from({length:numValues},(_,i)=>new DataView(this.rawPayload).getFloat32(i*4,true)));
      for (var i=0; i<numValues; i++) {
        var fv = floatView[i];
        if (fv != undefined) {
          point.floatField('value'+i, fv);
          //console.log(('fv: '+ fv).blue);
          doWrite = true;
        }
      }

    } else if (this.msgType == DRONE_LINK_MSG_TYPE_CHAR) {
      point.stringField('value0', this.payloadToString() );
      doWrite = true;

    } else {
      //console.log('cant store msg type:', this.msgType);
    }

    // TODO: enable /disable here
    if (doWrite) {
      if (addr == '2>7.10') console.log('writing'.red);
      writeApi.writePoint(point);
      writeApi.flush();
    }
  }
}
