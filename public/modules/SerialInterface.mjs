
import NetworkInterface from './NetworkInterface.mjs';
import * as DMM from './DroneMeshMsg.mjs';
import {SerialPort} from 'serialport';
import CRC8 from './CRC.mjs';
import SerialDiagnosticText from './SerialDiagnosticText.mjs';
const crc8 = CRC8();


export default class SerialInterface extends NetworkInterface {

  constructor(dlm, id, clog, portName, binding, onDiagnostic) {
    super(dlm, id, clog);

    this.typeName = 'Serial';
    this.typeCode = 2;
    this.portName = portName;
    this.binding = binding;
    this.openSerialPort = null;
    this.serialPort = null;
    this.stopped = false;

    // decoding vars
    this.msgBuffer = new Uint8Array(DMM.DRONE_MESH_MSG_MAX_PACKET_SIZE+2);
    this.receivedSize = 0;
    this.msgLen = 0;
    this.decodeState = 0;
    this.diagnosticRecords = 0;
    this.diagnosticRejected = 0;
    this.diagnostics = new SerialDiagnosticText(text => {
      this.clog(`[Serial ${this.portName || this.id}] ${text}`);
      onDiagnostic?.(text);
    });

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
    if (this.stopped || this.serialPort) return;

    try {
      this.clog('Opening serial telemetry port: ' + this.portName);
      const port = new SerialPort({
        path: this.portName,
        baudRate: 115200,
        ...(this.binding ? { binding: this.binding } : {})
      });
      this.serialPort = port;

      const disconnected = () => {
        if (this.serialPort !== port) return;
        this.serialPort = null;
        this.openSerialPort = null;
        this.state = false;
        this.resetDecoder();
        this.scheduleReconnect();
      };
      port.on('error', error => {
        if (this.serialPort !== port || this.stopped) return;
        this.errorMsg = error.message;
        this.clog('Serial Error: ' + error.message);
        if (port.isOpen) {
          this.openSerialPort = null;
          this.state = false;
          port.close(disconnected);
        } else disconnected();
      });
      port.on('close', disconnected);
      port.on('open', () => {
        if (this.stopped || this.serialPort !== port) {
          port.close(() => {});
          return;
        }
        this.resetDecoder();
        this.errorMsg = '';
        this.openSerialPort = port;
        this.state = true;
        this.clog('Serial port open');
      });
      port.on('data', data => {
        if (this.openSerialPort !== port) return;
        try { this.decodeBuffer(data); }
        catch (error) { this.clog('decode error: ' + error); }
      });
    } catch (error) {
      this.errorMsg = error.message;
      this.clog('ERROR in opening serial port: ' + error);
      this.scheduleReconnect();
    }
  }

  close() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const port = this.serialPort;
    this.serialPort = null;
    this.openSerialPort = null;
    this.state = false;
    this.resetDecoder();
    if (port?.isOpen) port.close(() => {});
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


  scheduleReconnect() {
    if(this.stopped || this.reconnectTimer) return;
    this.reconnectTimer=setTimeout(()=>{
      this.reconnectTimer=null;this.attemptToOpenSerial();
    },10000);
    this.reconnectTimer.unref?.();
  }

  resetDecoder() {
    this.decodeState=0;this.receivedSize=0;this.msgLen=0;
    this.diagnostics.reset();
  }

  decodeByte(b) {
    if (this.decodeState === 0) {
      if (b === 0xFE) { this.decodeState=1;this.receivedSize=0; }
      else if (b === 0xFD) { this.decodeState=3;this.receivedSize=0; }
      return;
    }
    if (this.decodeState === 3) {
      if (b < 1 || b > 48) {
        this.decodeState=0;this.diagnosticRejected++;return;
      }
      this.msgLen=b+5;this.decodeState=4;
    } else if (this.decodeState === 1) {
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
    const diagnostic=this.decodeState===4;
    const record=this.msgBuffer.slice(0,this.msgLen);
    this.decodeState=0;this.receivedSize=0;
    if(diagnostic) {
      if((record[1]&~7)!==0 || crc8.calc(record,record.length-1)!==record[record.length-1]) {
        this.diagnosticRejected++;
        this.diagnostics.breakLine('corrupt record');
        return;
      }
      this.diagnosticRecords++;
      this.diagnostics.receive(record);
      return;
    }
    const message = new DMM.DroneMeshMsg(record);
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

    // serialport.write preserves queue order. flush() would discard RX/TX data.

    this.packetsSent++;

    return true;
  }

}
