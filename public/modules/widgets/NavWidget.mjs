
import Widget from './Widget.mjs';
import * as DLM from '../droneLinkMsg.mjs';

export default class NavWidget extends Widget {
  constructor(node) {
    super(node);

    var icon = document.createElement('i');
    icon.className = 'fas fa-drafting-compass';
    this.container.appendChild(icon);
    var txt = document.createElement('span');
    txt.innerHTML = '?m';
    this.container.appendChild(txt);
  }


  newParamValue(data) {
    if (data.param == 9 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
      // 9 - distance
      var d = data.values[0];
      if (d == undefined) d = 0;
      var dStr = '';
      if ( d < 1000) {
        dStr = d.toFixed( d < 10 ? 1 : 0) + 'm';
      } else {
        dStr = (d/1000).toFixed( 1 ) + 'km';
      }
      this.container.lastChild.innerHTML = dStr;
    }
  }


}
