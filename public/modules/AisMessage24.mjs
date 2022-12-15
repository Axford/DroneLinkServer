import AisMessage from './AisMessage.mjs';
import AisBitField from './AisBitField.mjs';
import DecodingError from './AisDecodingError.mjs';

class AisMessage24 extends AisMessage {

  // eslint-disable-next-line max-statements
  constructor(messageType, channel) {
    super(messageType, channel);
  }

  parseFromBitField(bitField) {
    super.parseFromBitField(bitField);

    this.partNum = bitField.getInt(38, 2);

    if (this.partNum === 0) {
      this.setPartAProperties(bitField);
    } else if (this.partNum === 1) {
      this.setPartBProperties(bitField);
    } else {
      throw new DecodingError(
        `Invalid part number '${this.partNum}' while decoding message type 24`
      );
    }
  }

  setPartAProperties(bitField) {
    this.name = bitField.getString(40, 120);
  }

  setPartBProperties(bitField) {
    this.typeAndCargo = bitField.getInt(40, 8);
    this.vendorId = bitField.getString(48, 18);
    this.model = bitField.getInt(66, 4);
    this.serial = bitField.getInt(70, 20);
    this.callsign = bitField.getString(90, 42);

    if (this.isAuxiliaryCraft(this.mmsi)) {
      this.mothershipMMSI = bitField.getInt(132, 30);
    } else {
      this.dimBow = bitField.getInt(132, 9);
      this.dimStern = bitField.getInt(141, 9);
      this.dimPort = bitField.getInt(150, 6);
      this.dimStarboard = bitField.getInt(156, 6);
    }
  }
}

export default AisMessage24;