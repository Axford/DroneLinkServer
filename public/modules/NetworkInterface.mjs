
import * as DMM from './DroneMeshMsg.mjs';


export default class NetworkInterface {

  constructor(dlm, id, clog) {
    this.id = id;
    this.dlm = dlm;
    this.clog = clog;
    this.state = false;

    this.packetsSent = 0;
    this.packetsReceived = 0;
    this.packetsRejected = 0;
  }

}
