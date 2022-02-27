

export default class NodeSettings {

  constructor(node, tabs, panels) {
    this.node = node;

    this.ui = {};

    // create tab
    tabs.add('NodeSettings', 'UI Settings', '<i class="fas fa-cog"></i>');

    

  }


}
