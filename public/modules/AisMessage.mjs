import AisBitField from './AisBitField.mjs';

class AisMessage {

  constructor(messageType, channel, bitField) {
    this.type = messageType;
    this.channel = channel;
    this.repeat = bitField.getInt(6, 2);
    this.mmsi = bitField.getInt(8, 30);
    this.sentences = [];
  }

  isAuxiliaryCraft(mmsi) {
    const mmsiString = mmsi.toString();
  
    if (mmsiString.length !== 9) {
      return false;
    }
  
    const firstTwoDigits = Number(mmsiString.slice(0, 2));
    const lastFourDigits = Number(mmsiString.slice(5));
  
    // TODO: Also check for MID
    const belongsToAuxiliaryCraft =
      firstTwoDigits === 98 && lastFourDigits > 0 && lastFourDigits <= 9999;
  
    return belongsToAuxiliaryCraft;
  }
}

export default AisMessage;