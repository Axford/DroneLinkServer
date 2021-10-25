/*
     Base class for Mini UI widget for display in the Observer view

     * Bound to an instance of a Module Type for a particulr node
     * Manages detecting, tracking and rendering value changes
     * Provides interaction
*/

export default class Widget {
  constructor(node) {
    this.node = node;

    this.container = document.createElement('div');
    this.container.className = 'widget';
    node.uiWidgets.appendChild(this.container);

  }

  newParamValue(data) {
    // override
  }

}
