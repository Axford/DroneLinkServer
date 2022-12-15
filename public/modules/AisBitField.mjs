const sixBitAsciiChars =
  '@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_ !"#$%&\'()*+,-./0123456789:;<=>?';

export default class AisBitField {

  constructor(payload) {
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

  getBoolean(startIndex, length) {
    return Boolean(this.getInt(startIndex, length));
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
