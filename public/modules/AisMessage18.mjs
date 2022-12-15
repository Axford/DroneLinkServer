import AisMessage from './AisMessage.mjs';
import AisBitField from './AisBitField.mjs';
import format from './AisFormat.mjs';

class AisMessage18 extends AisMessage {

  constructor(messageType, channel) {
    super(messageType, channel);
    this.speedOverGround = 0;
    this.accuracy = false;
    this.lon = 0;
    this.lat = 0;
    this.courseOverGround = 0;
    this.heading = 0;
    this.utcSecond = 0;
    this.regional = 0;
    this.unitFlag = true; 
    this.displayFlag = false;
    this.dscFlag = 0;
    this.bandFlag = 0;
    this.msg22Flag = 0;
    this.modeFlag = 0;
    this.raim = false;
    this.radio = 0;
  }

  parseFromBitField(bitField){
    super.parseFromBitField(bitField);

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

  populateBitField(bitField) {
    bitField.setNumberOfBits(168);
    super.populateBitField(bitField);

    // endcode fields
    bitField.setInt(0,6,18); // message type
    bitField.setInt(46,10, this.speedOverGround*10,0);
    bitField.setBoolean(56,1, this.accuracy);
    bitField.setSignedInt(57,28, this.lon * 600000);
    bitField.setSignedInt(85,27, this.lat * 600000);
    bitField.setInt(112, 12, this.courseOverGround*10);
    bitField.setInt(124, 9, this.heading);
    bitField.setInt(133, 6, this.utcSecond);
    bitField.setInt(139, 2, this.regional);
    bitField.setBoolean(141, 1, this.unitFlag);
    bitField.setBoolean(142, 1, this.displayFlag);
    bitField.setBoolean(143, 1, this.dscFlag);
    bitField.setBoolean(144, 1, this.bandFlag);
    bitField.setBoolean(145, 1, this.msg22Flag);
    bitField.setBoolean(146, 1, this.modeFlag);
    bitField.setBoolean(147, 1, this.raim);
    bitField.setInt(148, 20, this.radio);
  }
}

export default AisMessage18;