

export const DRONE_LINK_SOURCE_OWNER     =  0;

export const DRONE_LINK_MSG_TYPE_UINT8_T =  0;
export const DRONE_LINK_MSG_TYPE_ADDR     = 1;
export const DRONE_LINK_MSG_TYPE_UINT32_T = 2;
export const DRONE_LINK_MSG_TYPE_FLOAT    = 3;
export const DRONE_LINK_MSG_TYPE_CHAR     = 4;
export const DRONE_LINK_MSG_TYPE_NAME     = 5;   // reply with param name in char format
export const DRONE_LINK_MSG_TYPE_NAMEQUERY = 6;  // query for the param name
export const DRONE_LINK_MSG_TYPE_QUERY     = 7;  // to query the value of a param, payload should be empty

export const DRONE_LINK_MSG_WRITABLE      = 0b10000000;  // top bit indicates if param is writable

export const DRONE_MODULE_PARAM_STATUS      =1;  // 0=disabled, 1=enabled, write a value of 2 or above to trigger reset
export const DRONE_MODULE_PARAM_NAME        =2;  // text
export const DRONE_MODULE_PARAM_ERROR       =3;  // text or error code, module defined implementation
export const DRONE_MODULE_PARAM_RESETCOUNT  =4;  // resetCount
export const DRONE_MODULE_PARAM_TYPE        =5;  // module type


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
    this.msgType = 0;
    this.msgLength = 0;
    this.rawPayload = new ArrayBuffer(16);
    this.uint8_tPayload = new Uint8Array(this.rawPayload);
    this.values = [];

    if (buffer) this.parse(buffer);
  }

  asString() {
    return this.source + ':' + this.node + '>' + this.channel + '.' + this.param + '('+this.msgType+')=' + this.payloadToString();
  }

  parse(buffer) {
		this.source = buffer[0];
    this.node = buffer[1];
    this.channel = buffer[2];
    this.param = buffer[3];
    this.msgType = (buffer[4] >> 4) & 0x0F;
    this.msgLength = (buffer[4] & 0x0F) + 1;
    for (var i=0; i < this.msgLength; i++) {
      this.uint8_tPayload[i] = buffer[5+i];
    }
  }

  encode() {
    // return Uint8Array
    var buffer = new Uint8Array(this.msgLength + 4 + 2);
    buffer[0] = 0xFE;
		buffer[1] = this.source;
    buffer[2] = this.node;
    buffer[3] = this.channel;
    buffer[4] = this.param;
    buffer[5] = (this.msgType << 4) | ((this.msgLength-1) & 0x0F);

    for (var i=0; i<this.msgLength; i++) {
      buffer[6+i] = this.uint8_tPayload[i];
    }
    buffer[buffer.length-1] = crc8.calc(buffer.slice(1,this.msgLength+6), this.msgLength + 5);
    //console.log('Sending: '+bufferToHex(buffer));
    return buffer;
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

    return s;
  }

  payloadAsFloat() {
    let floatView = new Float32Array(this.rawPayload, 0, this.msgLength/4);
    return floatView;
  }
}
