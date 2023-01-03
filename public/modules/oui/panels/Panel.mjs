export default class Panel {
  constructor(node, tabs, panels) {
    this.node = node;
    this.tabs = tabs;
    this.panels = panels;
    this.visible = false;
    this.built = false;

    this.tabName = '';
    this.title = '';
    this.icon = '';
    this.ui = {};
  }

  build() {
    // create tab
    this.tabs.add(this.tabName, this.title, '<i class="'+this.icon+'"></i>');

    // create panel container
    this.ui.panel = $('<div class="'+this.tabName+'Panel" style="display:none;"/>');
    this.panels.append(this.ui.panel);

    this.built = true;
  }

  show() {
    if (this.visible) return;
    this.visible = true;
    this.ui.panel.show();
    this.update();
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.ui.panel.hide();
  }

  update() {
    // override
  }

  resize() {
    // override
  }

}
