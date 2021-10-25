
import Widget from './Widget.mjs';

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
    if (data.param == 9) {
      // 9 - distance
      var d = data.values[0];
      this.container.lastChild.innerHTML = d.toFixed( d < 10 ? 1 : 0) + 'm';
    }
  }


}
