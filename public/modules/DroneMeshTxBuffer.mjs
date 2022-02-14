
import * as DMM from './DroneMeshMsg.mjs';



// buffer states
export const DRONE_MESH_MSG_BUFFER_STATE_EMPTY      =0;   // empty (or already sent)
export const DRONE_MESH_MSG_BUFFER_STATE_READY      =1;   // ready to send
export const DRONE_MESH_MSG_BUFFER_STATE_WAITING    =2;   // waiting for Ack


export class DroneMeshTxBuffer {

  constructor() {
    this.msg = new DMM.DroneMeshMsg();
    this.state = DRONE_MESH_MSG_BUFFER_STATE_EMPTY;
    this.netInterface = null;
    this.attempts = 0;
    this.created = 0;
    this.sent = 0;
  }

  getStateName() {
    if (this.state == DRONE_MESH_MSG_BUFFER_STATE_EMPTY) {
      return 'Empty';
    } else if (this.state == DRONE_MESH_MSG_BUFFER_STATE_READY) {
      return 'Ready';
    } else if (this.state == DRONE_MESH_MSG_BUFFER_STATE_WAITING) {
      return 'Waiting';
    }
    return '??';
  }




}
