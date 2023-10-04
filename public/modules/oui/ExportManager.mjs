

export default class ExportManager {

    constructor(ui, state) {
      this.ui = ui;
      this.state = state;
      this.visible = false;
  
  
      // param.value
      state.on('param.value', (data)=>{
        //{ node: msg.node, channel:msg.channel, param: msg.param, msgType: msg.msgType, values:Array.from(msg.valueArray()) });
  
      });
  
    }


    show() {

    }

    hide() {
        
    }


} // end of class
  