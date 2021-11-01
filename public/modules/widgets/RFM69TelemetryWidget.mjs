
import Widget from './Widget.mjs';
import * as DLM from '../droneLinkMsg.mjs';

export default class RFM69TelemetryWidget extends Widget {
  constructor(node) {
    super(node);

    var icon = document.createElement('i');
    icon.className = 'fas fa-broadcast-tower';
    this.container.appendChild(icon);
    var txt = document.createElement('span');
    txt.innerHTML = '?db';
    this.container.appendChild(txt);
  }


  newParamValue(data) {
    if (data.param == 8 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
      // RSSI
      var d = data.values[0];
      if (d > 100) {
        this.container.classList.add('danger');
      } else if (d > 80) {
        this.container.classList.add('warning');
        this.container.classList.remove('danger');
      } else {
        this.container.classList.remove('danger');
        this.container.classList.remove('warning');
      }
      this.container.lastChild.innerHTML = '-' + d.toFixed(0) + 'db';
    }
  }


}
