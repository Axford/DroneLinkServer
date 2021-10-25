
import Widget from './Widget.mjs';

export default class NMEAWidget extends Widget {
  constructor(node) {
    super(node);

    var icon = document.createElement('i');
    icon.className = 'fas fa-satellite-dish';
    this.container.appendChild(icon);
    var txt = document.createElement('span');
    txt.innerHTML = '?';
    this.container.appendChild(txt);
  }

/*

#define NMEA_PARAM_LOCATION           8
#define NMEA_PARAM_SATELLITES         9
#define NMEA_PARAM_HEADING            10
#define NMEA_PARAM_SPEED              11
#define NMEA_PARAM_HDOP               12
#define NMEA_PARAM_PORT               13
#define NMEA_PARAM_BAUD               14

*/

  newParamValue(data) {
    if (data.param == 9) {
      // 9 - satellites
      var d = data.values[0];
      if (d < 4) {
        this.container.classList.add('danger');
      } else if (d < 10) {
        this.container.classList.add('warning');
        this.container.classList.remove('danger');
      } else {
        this.container.classList.remove('danger');
        this.container.classList.remove('warning');
      }
      this.container.lastChild.innerHTML = d.toFixed(0);
    }
  }


}
