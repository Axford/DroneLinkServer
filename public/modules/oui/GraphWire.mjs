import * as DLM from '../droneLinkMsg.mjs';
import Vector from '../Vector.mjs';


export default class GraphWire {
  constructor(mgr, state, port, onode, ochannel, oparam) {
    this.mgr = mgr;
    this.state = state;
    this.port = port;
    this.oport = null; // other port
    this.onode = onode;
    this.ochannel = ochannel;
    this.oparam = oparam;
  }


  updateOtherPort() {
    // find matching port
    this.oport = this.mgr.getPortByAddress(this.ochannel, this.oparam);
    if (this.oport) {
      this.oport.connected = true;
    }
  }


  draw() {
    var c = this.mgr.canvas[0];
    var ctx = c.getContext("2d");

    ctx.strokeStyle = '#5f5';
    ctx.fillStyle = '#5f5';
    ctx.lineWidth = 3;

    var p = this.port;

    if (this.oport == null) {
      // attempt to locate port info
      this.updateOtherPort();
    }

    var op = this.oport;

    var x1 = p.block.x1;
    var y1 = (p.block.y1 + p.y + p.height/2);
    var x2 = op ? op.block.x2 : x1 - 20;
    var y2 = op ? (op.block.y1 + op.y + op.height/2) : y1;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 - 20, y1 , x2 + 20, y2 , x2, y2);
    ctx.stroke();
  }


}
