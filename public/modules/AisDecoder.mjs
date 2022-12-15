
import AisSentence from './AisSentence.mjs';
import DecodingError from './AisDecodingError.mjs';
import AisBitField from './AisBitField.mjs';

import AisMessage from './AisMessage.mjs';
import AisMessage24 from './AisMessage24.mjs';
import AisMessage18 from './AisMessage18.mjs';
import AisMessage123 from './AisMessage123.mjs';
/*
import AisMessage4 from './messages/ais-message-4';
import AisMessage5 from './messages/ais-message-5';
import AisMessage8 from './messages/ais-message-8';
*/

export default class AisDecoder {
  constructor() {
    this.multiPartBuffer = [];
    this.onDecode = null; // calback
  }

  parse(message) {
    try {
      const sentence = new AisSentence();
      sentence.parse(message);

      if (sentence.isMultiPart()) {
        this.handleMultiPartSentence(sentence);
      } else {
        this.decodePayload(sentence.payload, sentence.channel, [sentence]);
      }
    } catch (err) {
      console.error(err);
    }
  }

  handleMultiPartSentence(sentence) {
    this.multiPartBuffer.push(sentence);

    if (sentence.isLastPart()) {
      if (this.multiPartBuffer.length !== sentence.numParts) {
        this.multiPartBuffer.length = 0;
        throw new DecodingError('Incorrect multipart order', sentence);
      }

      const payloads = this.multiPartBuffer.map(
        multiPartSentence => multiPartSentence.payload
      );
      this.decodePayload(
        payloads.join(''),
        sentence.channel,
        this.multiPartBuffer
      );

      this.multiPartBuffer.length = 0;
    }
  }

  decodePayload(payload, channel, sentences) {
    const bitField = new AisBitField();
    bitField.setTextPayload(payload);
    const messageType = bitField.getInt(0, 6);

    //console.log(bitField, messageType);
    
    let decodedMessage = null;

    switch (messageType) {
      case 1:
      case 2:
      case 3:
        decodedMessage = new AisMessage123(messageType, channel);
        break;
      case 4:
        //decodedMessage = new AisMessage4(messageType, channel, bitField);
        break;
      case 5:
        //decodedMessage = new AisMessage5(messageType, channel, bitField);
        break;
      case 8:
        //decodedMessage = new AisMessage8(messageType, channel, bitField);
        break;
      case 18:
        decodedMessage = new AisMessage18(messageType, channel);
        break;
      case 24:
        decodedMessage = new AisMessage24(messageType, channel);
        break;
    }
    
    if (decodedMessage) {
      decodedMessage.parseFromBitField(bitField);
      decodedMessage.sentences = sentences.map(sentence => sentence);
      
      if (this.onDecode) this.onDecode(decodedMessage);
    } else {
      console.log('Unknown AIS message type: ' + messageType);
    }
  }
}
