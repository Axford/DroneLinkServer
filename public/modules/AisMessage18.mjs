import AisMessage from './AisMessage.mjs';
import AisBitField from './AisBitField.mjs';
import format from './AisFormat.mjs';

class AisMessage18 extends AisMessage {

  constructor(messageType, channel, bitField) {
    super(messageType, channel, bitField);
    this.speedOverGround = format.speedOverGround(bitField.getInt(46, 10));
    this.accuracy = bitField.getBoolean(56, 1);
    this.lon = format.longitude(bitField.getSignedInt(57, 28));
    this.lat = format.latitude(bitField.getSignedInt(85, 27));
    this.courseOverGround = format.courseOverGround(bitField.getInt(112, 12));
    this.heading = format.heading(bitField.getInt(124, 9));
    this.utcSecond = bitField.getInt(133, 6);
    this.regional = bitField.getInt(139, 2);
    this.unitFlag = bitField.getBoolean(141, 1);
    this.displayFlag = bitField.getBoolean(142, 1);
    this.dscFlag = bitField.getBoolean(143, 1);
    this.bandFlag = bitField.getBoolean(144, 1);
    this.msg22Flag = bitField.getBoolean(145, 1);
    this.modeFlag = bitField.getBoolean(146, 1);
    this.raim = bitField.getBoolean(147, 1);
    this.radio = bitField.getInt(148, 20);
  }
}

export default AisMessage18;