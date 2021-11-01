
import Widget from './Widget.mjs';
import * as DLM from '../droneLinkMsg.mjs';

export default class INA219Widget extends Widget {
  constructor(node) {
    super(node);

    var icon = document.createElement('i');
    icon.className = 'fas fa-car-battery';
    this.container.appendChild(icon);
    var txt = document.createElement('span');
    txt.innerHTML = '?v';
    this.container.appendChild(txt);
  }


  /*

  #define INA219_PARAM_SHUNTV          (I2CBASE_SUBCLASS_PARAM_START+0) // 10
  #define INA219_PARAM_BUSV            (I2CBASE_SUBCLASS_PARAM_START+1) // 11
  #define INA219_PARAM_CURRENT         (I2CBASE_SUBCLASS_PARAM_START+2) // 12
  #define INA219_PARAM_POWER           (I2CBASE_SUBCLASS_PARAM_START+3) // 13
  #define INA219_PARAM_LOADV           (I2CBASE_SUBCLASS_PARAM_START+4) // 14
  #define INA219_PARAM_CELLV           (I2CBASE_SUBCLASS_PARAM_START+5) // 15
  #define INA219_PARAM_ALARM           (I2CBASE_SUBCLASS_PARAM_START+6) // 16
  #define INA219_PARAM_CELLS           (I2CBASE_SUBCLASS_PARAM_START+7) // 17
  #define INA219_PARAM_THRESHOLD       (I2CBASE_SUBCLASS_PARAM_START+8) // 18

  */

  newParamValue(data) {
    //console.log('INA219', data.param, data.values);
    if (data.param == 15 && data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
      // cellV
      var d = data.values[0];
      if (d < 3.3) {
        this.container.classList.add('danger');
      } else if (d < 3.6) {
        this.container.classList.add('warning');
        this.container.classList.remove('danger');
      } else {
        this.container.classList.remove('danger');
        this.container.classList.remove('warning');
      }
      this.container.lastChild.innerHTML = d.toFixed(1) + 'v';
    }
  }


}
