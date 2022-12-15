import AisBitField from './AisBitField.mjs';

class AisMessage {

  constructor(messageType, channel) {
    this.type = messageType;
    this.channel = channel;
    this.repeat = 0;
    this.mmsi = 0;
    this.sentences = [];
    this.bitField = null;
  }

  parseFromBitField(bitField) {
    this.bitField = bitField;
    this.repeat = bitField.getInt(6, 2);
    this.mmsi = bitField.getInt(8, 30);
  }

  populateBitField(bitField) {
    // bit length must have already been set by caller
    bitField.setInt(6,2, this.repeat);
    bitField.setInt(8,30, this.mmsi);
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