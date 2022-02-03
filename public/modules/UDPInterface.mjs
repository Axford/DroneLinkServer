
import NetworkInterface from './NetworkInterface.mjs';
import udp from 'dgram';
import * as DMM from './DroneMeshMsg.mjs';

export default class UDPInterface extends NetworkInterface {

  constructor(dlm) {
    super(dlm);

    // register self with dlm
    dlm.registerInterface(this);

    // creating a udp server
    this.server = udp.createSocket('udp4');

    // emits when any error occurs
    this.server.on('error',function(error){
      console.error('UDP Error: ' + error);
      this.server.close();
    });

    // emits on new datagram msg
    this.server.on('message', (msg,info)=>{
      //console.log('UDP Received %d bytes from %s:%d\n',msg.length, info.address, info.port);

      var newMsg = new DMM.DroneMeshMsg(msg);

      if (newMsg.isValid) {
        var metric = 15; // can't read RSSI, so set to a crap value to avoid nodes using us as a router

        // ignore stuff we've transmitted
        if (newMsg.txNode == this.dlm.node || newMsg.srcNode == this.dlm.node) return;

        // check this message is for us
        if (!newMsg.isUnicast() || newMsg.nextNode == this.dlm.node) {
          if (newMsg.getType() == DMM.DRONE_MESH_MSG_TYPE_DRONELINKMSG) {
             console.log('UDP: ' + (newMsg.toString()).yellow);
          } else {
            console.log('UDP: ' + newMsg.toString());
          }

          // pass onto DLM for processing
          this.dlm.receivePacket(this, newMsg, metric);
        } else {
          // TODO: consider sniffing network traffic
        }

      } else {
        console.error('UDP CRC fail: ' + newMsg.toString());
      }
    });

    //emits when socket is ready and listening for datagram msgs
    this.server.on('listening',()=>{
      var address = this.server.address();
      var port = address.port;
      var family = address.family;
      var ipaddr = address.address;
      console.log('UDP server is listening on '+ipaddr+':' + port);
      this.state = true;
    });

    //emits after the socket is closed using socket.close();
    this.server.on('close',function(){
      console.log(('UDP socket is closed').red);
      this.state = false;
    });

    this.server.bind(8007, () => {
      this.server.setBroadcast(true);
    });
  }


  sendPacket(msg) {
    console.log(('Send by UDP: ' + msg.toString()).yellow);
    this.server.send(msg.encode(), 8007, '255.255.255.255', function(error){
      if(error){
        console.error('BLERGH '+ error);
      }else{
        //console.log('Data sent !!!');
      }
    });
  }

}
