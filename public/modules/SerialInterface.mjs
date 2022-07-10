
import NetworkInterface from './NetworkInterface.mjs';
import * as DMM from './DroneMeshMsg.mjs';
import SerialPort from 'serialport';
import CRC8 from './CRC.mjs';
const crc8 = CRC8();


export default class SerialInterface extends NetworkInterface {

  constructor(dlm, id, clog, portName) {
    super(dlm, id, clog);

    this.typeName = 'Serial';
    this.typeCode = 2;
    this.portName = portName;
    this.openSerialPort = null;

    // decoding vars
    this.msgBuffer = new Uint8Array(DMM.DRONE_MESH_MSG_MAX_PACKET_SIZE+2);
    this.receivedSize = 0;
    this.msgLen = 0;
    this.state = 0;

    if ((!portName || (portName == ""))) {
      this.clog('ERROR undefined Serial Telemetry portName: '+portName);
      return;
    }

    // register self with dlm
    dlm.registerInterface(this);

    this.clog('Serial Interface registered');


    this.attemptToOpenSerial();
  }


  attemptToOpenSerial() {
    if (this.openSerialPort) return;

    var me = this;

    try {
      ///dev/tty.SLAB_USBtoUART
      this.clog('Opening serial telemetry port: ' + this.portName);
      const port = new SerialPort(this.portName, {
        baudRate: 115200
      });

      // Open errors will be emitted as an error event
      port.on('error', function(err) {
        me.clog('Serial Error: '+ err.message);

        me.openSerialPort = null;

        // wait a while, then try to open port again
        setTimeout(()=>{
          me.attemptToOpenSerial();
        }, 10000);
      });

      port.on('readable', function () {
        me.openSerialPort = port;

        //me.clog('Serial recv: ' + port.read());

        try {
          me.decodeBuffer(port.read());
        } catch(err) {
          me.clog('decode error: '+ err)
        }

      });
    } catch(err) {
      this.clog('ERROR in opening serial port: ' + err);
    }
  }


  decodeBuffer(buffer) {
    //this.clog('Recv:' + buffer);
    for (var i=0; i<buffer.length; i++) {
      this.decodeByte(buffer[i]);
    }
  }


  getDroneMeshMsgTotalSize(b) {
      return DMM.DRONE_MESH_MSG_HEADER_SIZE + 1 +
             (b & 0b00111111) + 1;
  }


  decodeByte(b) {
    if (this.receivedSize < this.msgBuffer.length) {
      this.msgBuffer[this.receivedSize] = b;
    } else {
      this.clog('Buffer exceeded');
      this.state = 0;
      this.receivedSize = 0;
    }


    switch(this.state) {
      case 0: // waiting for start
        if (b == 0xFE) {
          this.state = 1;
          this.receivedSize = 1;
          this.msgLen = 0;
          this.clog('Found start');
        }
        break;

      case 1: // found start, waiting to confirm payload length
        this.msgLen = this.getDroneMeshMsgTotalSize(b);
        if (this.msgLen < 8 || this.msgLen > DMM.DRONE_MESH_MSG_MAX_PACKET_SIZE) {
          this.state = 0;
          this.packetsRejected++;
          this.clog('Invalid payload size');
        } else {
          this.state = 2;
          this.receivedSize++;
          this.clog('Payload size: ' + this.msgLen);
        }
        break;

      case 2: // reading payload
        if (this.msgLen == this.receivedSize - 1) {
          // now we've received a full message, print it out
          var s = '';
          for (var i=0; i<this.receivedSize; i++) {
            s += this.msgBuffer[i].toString(16) + ' ';
          }
          this.clog('Recv raw: ' + s);

          // decode
          var newMsg = new DMM.DroneMeshMsg(this.msgBuffer.slice(1, this.receivedSize));

          if (newMsg.isValid) {
            this.clog(('Recv Msg: ' + newMsg.toString()).yellow);

            // pass onto DLM for processing
            this.dlm.receivePacket(this, newMsg, 1, this.id);

            this.packetsReceived++;
          } else {
            this.clog('CRC fail');
          }

          this.state = 0;
          this.receivedSize = 0;
        }
        this.receivedSize++;
        break;

    }
  }


  sendPacket(msg, interfaceAddress) {

    if (!this.openSerialPort) return false;

    this.clog(('Send by Serial: ' + msg.toString()).yellow);


    // calc txSize - add start byte
    var txSize = msg.getTotalSize() + 1;

    var txBuffer = new Uint8Array(txSize);
    txBuffer[0] = 0xFE;

    // copy msg raw
    var msgBuffer = msg.encode();
    for (var i=0; i<msgBuffer.length; i++) {
      txBuffer[i+1] = msgBuffer[i];
    }

    // write to serial port
    this.openSerialPort.write(txBuffer);

    this.packetsSent++;

    return true;
  }

}
