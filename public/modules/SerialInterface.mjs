
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
    this.decodeState = 0;

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
        me.errorMsg = err.message;

        me.openSerialPort = null;
        me.state = false;
        
        // wait a while, then try to open port again
        setTimeout(()=>{
          me.attemptToOpenSerial();
        }, 10000);
      });

      port.on('open', () =>{
        me.openSerialPort = port;
        me.state = true;
        me.clog('Serial port open');
      })

      port.on('data', function (data) {
        
       // me.clog('Serial recv: ' + data);

        try {
          me.decodeBuffer(data);
        } catch(err) {
          me.clog('decode error: '+ err)
        }

      });
    } catch(err) {
      this.clog('ERROR in opening serial port: ' + err);
      me.errorMsg = err.message;
    }
  }


  decodeBuffer(buffer) {
    //this.clog('Recv:' + buffer);
    for (var i=0; i<buffer.length; i++) {
      this.decodeByte(buffer[i]);
      this.bytesReceived++;
    }
  }


  getDroneMeshMsgTotalSize(b) {
      return DMM.DRONE_MESH_MSG_HEADER_SIZE + 1 +
             (b & 0b00111111) + 1;
  }


  decodeByte(b) {
    if (this.decodeState === 0) {
      if (b === 0xFE) { this.decodeState = 1; this.receivedSize = 0; }
      return;
    }
    if (this.decodeState === 1) {
      this.msgLen = this.getDroneMeshMsgTotalSize(b);
      if (this.msgLen > DMM.DRONE_MESH_MSG_MAX_PACKET_SIZE) {
        this.decodeState = b === 0xFE ? 1 : 0;
        this.packetsRejected++;
        return;
      }
      this.decodeState = 2;
    }
    this.msgBuffer[this.receivedSize++] = b;
    if (this.receivedSize !== this.msgLen) return;
    const message = new DMM.DroneMeshMsg(this.msgBuffer.slice(0, this.msgLen));
    this.decodeState = 0;
    this.receivedSize = 0;
    if (message.isValid) {
      this.dlm.receivePacket(this, message, 1, this.id);
      this.packetsReceived++;
    } else this.packetsRejected++;
  }


  sendPacket(msg, interfaceAddress) {

    if (!this.openSerialPort) return false;

    //this.clog(('Send by Serial: ' + msg.toString()).yellow);


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

    this.openSerialPort.flush();

    this.packetsSent++;

    return true;
  }

}
