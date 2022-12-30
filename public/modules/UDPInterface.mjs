
import NetworkInterface from './NetworkInterface.mjs';
import udp from 'dgram';
import * as DMM from './DroneMeshMsg.mjs';

export default class UDPInterface extends NetworkInterface {

  constructor(dlm, id, clog) {
    super(dlm, id, clog);

    this.typeName = 'UDP';
    this.typeCode = 0;

    // register self with dlm
    dlm.registerInterface(this);

    this.clog('UDP Interface registered');

    // creating a udp server
    this.server = udp.createSocket('udp4');

    // emits when any error occurs
    this.server.on('error',function(error){
      this.clog(('UDP Error: ' + error).red);
      this.server.close();
    });

    // emits on new datagram msg
    this.server.on('message', (msg,info)=>{
      //this.clog('UDP Received %d bytes from %s:%d\n',msg.length, info.address, info.port);

      var newMsg = new DMM.DroneMeshMsg(msg);

      this.bytesReceived += msg.length;

      if (newMsg.isValid) {
        //this.clog('got valid packet...');
        var metric = 15; // can't read RSSI, so set to a crap value to avoid nodes using us as a router

        // ignore stuff we've transmitted
        if (newMsg.txNode == this.dlm.node || newMsg.srcNode == this.dlm.node) return;

        // check this message is for us
        if (newMsg.nextNode == this.dlm.node || newMsg.nextNode == 0) {
          // pass onto DLM for processing
          this.dlm.receivePacket(this, newMsg, metric, info.address);

          this.packetsReceived++;
        } else {
          // TODO: consider sniffing network traffic
          //this.clog('not for us')
        }

      } else {
        this.clog(('UDP CRC fail: ' + newMsg.toString()).red);
        this.packetsRejected++;
      }
    });

    //emits when socket is ready and listening for datagram msgs
    this.server.on('listening',()=>{
      var address = this.server.address();
      var port = address.port;
      var family = address.family;
      var ipaddr = address.address;
      this.clog('UDP server is listening on '+ipaddr+':' + port);
      this.state = true;
    });

    //emits after the socket is closed using socket.close();
    this.server.on('close',function(){
      this.clog(('UDP socket is closed').red);
      this.state = false;
    });

    this.server.bind(8007, () => {
      this.server.setBroadcast(true);
    });
  }


  sendPacket(msg, interfaceAddress) {
    //this.clog(('Send by UDP: ' + msg.toString()).yellow);
    this.packetsSent++;
    var addr = interfaceAddress ? interfaceAddress : '255.255.255.255';
    this.server.send(msg.encode(), 8007, addr, function(error){
      if(error){
        //console.error('BLERGH '+ error);
        this.clog(('UDP error: '+error).red);
        //process.exit(0);
      }else{
        //this.clog('Data sent !!!');
      }
    });
    return true;
  }

}
