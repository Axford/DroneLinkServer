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
} from './vendor/protocol-0.1.2.mjs';

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

    if (buffer) this.parse(buffer);
  }

  totalSize() {
    return DRONE_LINK_MSG_HEADER_BYTES + this.msgLength;
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
    var buffer = new Uint8Array(rawBuffer, 0);
    this.source = buffer[0];
    this.node = buffer[1];
    this.channel = buffer[2];
    this.param = buffer[3] & 0b00111111;
    this.priority = buffer[3] >> 6;
    this.msgType = (buffer[4] >> 4) & 0x07;
    this.msgLength = (buffer[4] & 0x0F) + 1;
    this.writable = (buffer[4] & DRONE_LINK_MSG_WRITABLE) > 0;
    for (var i=0; i < this.msgLength; i++) {
      this.uint8_tPayload[i] = buffer[5+i];
    }
  }

  parseFromLog(buffer) {
    const t = ((buffer[1] << 24) | (buffer[2] << 16) | (buffer[3] << 8) | buffer[4]) >>> 0;
    this.timestamp = t;

    this.source = buffer[5 + 0];
    this.node = buffer[5 + 1];
    this.channel = buffer[5 + 2];
    this.param = buffer[5 + 3] & 0b00111111;
    this.priority = buffer[5 + 3] >> 6;
    this.msgType = (buffer[5 + 4] >> 4) & 0x07;
    this.msgLength = (buffer[5 + 4] & 0x0F) + 1;
    this.writable = (buffer[5 + 4] & DRONE_LINK_MSG_WRITABLE) > 0;
    for (var i=0; i < this.msgLength; i++) {
      this.uint8_tPayload[i] = buffer[5 + 5+i];
    }
  }

  copy(msg) {
    this.source = msg.source;
    this.node = msg.node;
    this.channel = msg.channel;
    this.param = msg.param;
    this.priority = msg.priority;
    this.msgType = msg.msgType;
    this.msgLength = msg.msgLength;
    this.writable = msg.writable;
    //console.log('msgTypeLength: ', buffer[3].toString(2));
    for (var i=0; i < this.msgLength; i++) {
      this.uint8_tPayload[i] = msg.uint8_tPayload[i];
    }
  }

	setUint8(values) {
		this.msgType = DRONE_LINK_MSG_TYPE_UINT8_T;
		this.msgLength = values.length;
    this.writable = false;
		for (var i=0; i < values.length; i++) {
      this.uint8_tPayload[i] =values[i];
    }
	}

  setUint32(values) {
    if (values === undefined) {
      console.error('Undefined values for setUint32: ', values);
      return;
    }
      
		this.msgType = DRONE_LINK_MSG_TYPE_UINT32_T;
		this.msgLength = values.length * 4;
    this.writable = false;
    var vv = new Uint32Array(this.rawPayload, 0, values.length);
		for (var i=0; i < values.length; i++) {
      vv[i] =values[i];
    }
	}

  setFloat(values) {
		this.msgType = DRONE_LINK_MSG_TYPE_FLOAT;
		this.msgLength = values.length * 4;
    this.writable = false;
    var vv = new Float32Array(this.rawPayload, 0, values.length);
		for (var i=0; i < values.length; i++) {
      vv[i] =values[i];
    }
	}
  
  setAddr(values) {
    if (!values || ![4, 8, 12, 16].includes(values.length) ||
        Array.from(values).some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
      throw new RangeError('ADDR requires one to four complete four-byte addresses');
    }
    this.msgType = DRONE_LINK_MSG_TYPE_ADDR;
    this.msgLength = values.length;
    this.writable = false;
    this.uint8_tPayload.set(values);
  }

	parseAddress(addr) {
		var gti = addr.indexOf('>');
    var pi = addr.indexOf('.');
		var a = {
			node: parseInt(addr.substring(0,gti)),
			channel: parseInt(addr.substring(gti+1,pi)),
			param: parseInt(addr.substring(pi+1, addr.length))
		}
		return a;
	}

	setAddress(addr) {
		var a = this.parseAddress(addr);
    this.node = a.node;
		this.channel = a.channel;
		this.param = a.param;
  }

  setPriority(p) {
    this.priority = p;
  }

  setString(s) {
		this.msgType = DRONE_LINK_MSG_TYPE_CHAR;
    this.msgLength = s.length;
    for (var i=0; i < this.msgLength; i++) {
      this.uint8_tPayload[i] = s.charCodeAt(i);
    }
  }

	setName(s) {
		this.setString(s);
		this.msgType = DRONE_LINK_MSG_TYPE_NAME;
  }

  encode() {
    if (!Number.isInteger(this.msgLength) || this.msgLength < 1 || this.msgLength > DRONE_LINK_MSG_MAX_PAYLOAD) {
      throw new RangeError('Framed link payload must contain 1–16 bytes');
    }
    const payload = this.encodeUnframed();
    const frame = new Uint8Array(payload.length + 2);
    frame[0] = 0xFE;
    frame.set(payload, 1);
    frame[frame.length - 1] = crc8.calc(payload, payload.length);
    return frame;
  }

	encodeUnframed() {
    // return Uint8Array
    var buffer = new Uint8Array(this.msgLength + DRONE_LINK_MSG_HEADER_BYTES);
    buffer[0] = this.source;
    buffer[1] = this.node;
    buffer[2] = this.channel;
    buffer[3] = this.priority << 6 | (this.param & 0b00111111);
    buffer[4] = (this.writable ? DRONE_LINK_MSG_WRITABLE : 0) | (this.msgType << 4) | ((this.msgLength-1) & 0x0F);

    for (var i=0; i<this.msgLength; i++) {
      buffer[5+i] = this.uint8_tPayload[i];
    }
    return buffer;
  }

  getLogEncodingSize() {
    return this.msgLength + 5 + 4 + 1;
  }

  encodeForLog() {
    // prefixes a total size and timestamp
    // return Uint8Array
    var packetSize = this.getLogEncodingSize();
    var buffer = new Uint8Array(packetSize);
    buffer[0] = packetSize;

    // encode timestamp
    buffer[1] = (this.timestamp >> 24) & 0xFF;
    buffer[2] = (this.timestamp >> 16) & 0xFF;
    buffer[3] = (this.timestamp >> 8) & 0xFF;
    buffer[4] = (this.timestamp) & 0xFF;

    // encode actual packet
    buffer[5+0] = this.source;
    buffer[5+1] = this.node;
    buffer[5+2] = this.channel;
    buffer[5+3] = this.priority << 6 | (this.param & 0b00111111)
    buffer[5+4] = (this.writable ? DRONE_LINK_MSG_WRITABLE : 0) | (this.msgType << 4) | ((this.msgLength-1) & 0x0F);

    for (var i=0; i<this.msgLength; i++) {
      buffer[5+5+i] = this.uint8_tPayload[i];
    }
    return buffer;
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
      var temp = new Uint32Array(this.rawPayload, 0, numValues);
      valueView = Array.from(temp);
      //console.log("u32", valueView);

    } else if (this.msgType == DRONE_LINK_MSG_TYPE_FLOAT) {
      valueView = new Float32Array(this.rawPayload, 0, numValues);
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
      let int32view = new Uint32Array(this.rawPayload, 0, numValues);
      for (var i=0; i<numValues; i++) {
        var uv = int32view[i];
        if (uv == undefined) uv = 0;
        point.intField('value'+i, uv);
      }
      doWrite = true;

    } else if (this.msgType == DRONE_LINK_MSG_TYPE_FLOAT) {
      let floatView = new Float32Array(this.rawPayload, 0, numValues);
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
