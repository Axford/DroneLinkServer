import Panel from './Panel.mjs';
import loadStylesheet from '../../loadStylesheet.js';

loadStylesheet('./css/modules/oui/panels/NodeSettings.css');


export default class NodeSettings extends Panel {

  constructor(node, tabs, panels) {
    super(node, tabs, panels);

    this.tabName = 'NodeSettings';
    this.title = 'UI Settings';
    this.icon = 'fas fa-cog';

    this.build();
  }


  build() {
    super.build();

    // container for mapParams
    this.ui.mapParamsContainer = $('<table />');
    this.ui.panel.append(this.ui.mapParamsContainer);

    // headings
    this.ui.mapParamsContainer.append($('<thead><tr> <th>Map Param</th> <th>Priority</th> <th>Channel</th> <th>Param</th> <th>Path</th> </tr></thead>'));

    // body
    this.ui.mapParamsBody = $('<tbody/>');
    this.ui.mapParamsContainer.append(this.ui.mapParamsBody);
  }

  update() {
    var s = '';

    for (const [paramName, paramObj] of Object.entries(this.node.mapParams)) {
      var obj = this.node.state.getObjectsForAddress(this.node.id, paramObj.channel, paramObj.param);

      s += '<tr>';
      s += '<td>'+paramName+'</td>';
      s += '<td>'+paramObj.priority+'</td>';
      s += '<td>'+paramObj.channel + '</td>';
      s += '<td>'+paramObj.param+'</td>';
      s += '<td>';
      if (obj.channel && obj.channel.name) {
        s+= obj.channel.name;
      }
      s += '.';
      if (obj.param && obj.param.name) {
        s+= obj.param.name;
      }
      s += '</td>';
      s += '</tr>';
    }

    this.ui.mapParamsBody.html(s);
  }


}
