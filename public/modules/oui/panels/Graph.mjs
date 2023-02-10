import Panel from './Panel.mjs';
import loadStylesheet from '../../loadStylesheet.js';

import GraphManager from '../GraphManager.mjs';

loadStylesheet('./css/modules/oui/panels/Graph.css');


export default class Graph extends Panel {

  constructor(node, tabs, panels) {
    super(node, tabs, panels);

    this.tabName = 'Graph';
    this.title = 'Node Graph';
    this.icon = 'fas fa-project-diagram';

    this.build();
  }


  build() {
    super.build();

    this.graphManager = new GraphManager(this.node, this.ui.panel);

    this.node.state.on('module.new', (data)=>{
      if (data.node != this.node.id) return;

      // create new graph element for the module/channel
      this.graphManager.addBlock(this.node.state, data);
    });
  }

  update() {
    if (!this.visible) return;
    this.graphManager.resize();
  }


  resize() {
    // trigger a graph resize... just in case
    this.graphManager.resize();
  }

  show() {
    super.show();
    this.graphManager.show();
  }

  hide() {
    super.hide();
    this.graphManager.hide();
  }


}
