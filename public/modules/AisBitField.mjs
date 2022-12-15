const sixBitAsciiChars =
  '@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_ !"#$%&\'()*+,-./0123456789:;<=>?';

export default class AisBitField {

  constructor(payload) {
    this.payload = '';
    this.binaryPayload = '';
  }

  setNumberOfBits(numBits) {
    this.binaryPayload = new Array(numBits).fill('0');
  }

  convertBinaryToText() {
    // first binary to text string
    this.binaryPayload = this.binaryPayload.join('');

    // now convert the binary string into ASCII encoding
    // read in 6 char chunks...  
    this.payload = '';
    for (var i=0; i<this.binaryPayload.length; i+=6) {
      var s = this.binaryPayload.substr(i,6);
      var v = parseInt(s, 2);
      v += 48;
      if (v>87) v+= 8;
      var c = String.fromCharCode(v);
      this.payload += c;
      //console.log(i, s, v, c);
    }
  }

  setTextPayload(payload) {
    this.payload = payload;
    this.binaryPayload = '';

    for (let i = 0; i < this.payload.length; i++) {
      let asciiValue = this.payload.charCodeAt(i) - 48;

      if (asciiValue > 40) {
        asciiValue -= 8;
      }

      const binaryValue = asciiValue.toString(2);
      this.binaryPayload += `000000${binaryValue}`.slice(-6);
    }
  }

  getInt(startIndex, length) {
    const binary = this.binaryPayload.substr(startIndex, length);
    return parseInt(binary, 2);
  }

  setInt(startIndex, length, i) {
    i = Math.round(i,0);
    var bs = i.toString(2);
    // pad to correct length
    while (bs.length < length) {
      bs = '0' + bs;
    }
    // write into binaryPayload
    for (var i=0; i<length; i++) {
      this.binaryPayload[startIndex+i] = bs[i];
    }
  }

  getSignedInt(startIndex, length) {
    let int = this.getInt(startIndex, length);

    // Convert to signed integer
    // eslint-disable-next-line no-bitwise
    if ((int & (1 << (length - 1))) !== 0) {
      // eslint-disable-next-line no-bitwise
      int -= 1 << length;
    }

    return int;
  }

  setSignedInt(startIndex, length, i) {
    i = Math.round(i,0);
    // if negative, calc twos complement
    var isNeg = i<0;
    if (isNeg) i += 1 << length;
    
    var bs = i.toString(2);
    // remove negative sign
    if (isNeg) bs = bs.slice(1);
    // pad to correct length
    while (bs.length < length) {
      bs = (isNeg ? '1' : '0') + bs;
    }
    //console.log(bs);
    // write into binaryPayload
    for (var i=0; i<length; i++) {
      this.binaryPayload[startIndex+i] = bs[i];
    }
  }

  getBoolean(startIndex, length) {
    return Boolean(this.getInt(startIndex, length));
  }

  setBoolean(startIndex, length, v) {
    this.setInt(startIndex, length, v ? 1 : 0);
  }

  getString(startIndex, length) {
    let stringValue = '';

    const chunkLength = 6;
    const binary = this.binaryPayload.substr(startIndex, length);
    const numChunks = Math.floor(length / chunkLength);

    // We need to split the binary payload into chunks of 6 bits and
    // map each chunk to its ASCII representation
    for (let i = 0, o = 0; i < numChunks; i++, o += chunkLength) {
      const binaryChunk = binary.substr(o, chunkLength);
      const position = parseInt(binaryChunk, 2);
      const char = sixBitAsciiChars.charAt(position);
      stringValue += char;
    }

    const terminationPosition = stringValue.indexOf('@');
    if (terminationPosition !== -1) {
      stringValue = stringValue.substring(0, terminationPosition);
    }

    return stringValue.trimRight();
  }
}
