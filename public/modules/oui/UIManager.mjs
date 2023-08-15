


export default class UIManager {
  constructor(nodes) {
    var me = this;

    me.nodes = nodes;
    me.contextHandlers = {};
    me.showingPrivateContextMenuFor = null;
  }


  getNodesWithMapParam(mapParam) {
    // return an array of nodes that have the specified mapParam
    var res = [];

    for (const [key, node] of Object.entries(this.nodes)) {
      if (node.mapParams.hasOwnProperty(mapParam)) {
        res.push(node);
      }
    };

    return res;
  }
  

  registerContextHandler(groupName, name, widget) {
    if (this.contextHandlers[groupName] === undefined) {
      this.contextHandlers[groupName] = {
        ele: null,
        items: []
      };
    }

    this.contextHandlers[groupName].items.push({
      name: name,
      widget: widget,
      ele: null
    });

    // sort?

    this.rebuildContextMenu();
  }

  rebuildContextMenu() {
    const me = this;
    const cm = $('#contextMenu');

    for (const [key, ch] of Object.entries(this.contextHandlers)) {
      if (ch.ele === null) {
        // create group element
        ch.ele = $('<div class="context-group">'+key+'</div>');
        cm.append(ch.ele);
      }

      // for each item
      ch.items.forEach((item)=>{
        if (item.ele === null) {
          // create item element
          item.ele = $('<a class="nav-link">'+item.name+'</a>');
          item.ele.on('click', ()=>{ me.contextHandler(item); } );
          cm.append(item.ele);
        }
      });

    }
  }

  contextHandler(item) {
    item.widget.globalContextHandler(this.lngLat);
    this.hideContextMenu();
  }


  // map coordinates are in lngLat as .lat and .lng
  // screen coordinates relative to map div are in point.x and point.y
  showContextMenu(point, lngLat) {
    this.lngLat = lngLat;

    if (this.showingPrivateContextMenuFor) {
      // do nothing

    } else {
      // hide a global menu if already open
      this.hideContextMenu();

      console.log('Showing global context menu');
      $('#contextMenu').show();
      $('#contextMenu').css({top:point.y, left:point.x});
    } 
  }

  showingPrivateContextMenu(node) {
    // hide a global menu if already open
    this.hideContextMenu();

    // called to inform the UI manager not to show context menus until the private menu is hidden
    this.showingPrivateContextMenuFor = node;
  }


  hidingPrivateContextMenu() {
    this.showingPrivateContextMenuFor = null;
  }


  hideContextMenu() {
    if (this.showingPrivateContextMenuFor) {
      this.showingPrivateContextMenuFor.hideContextMenu();
      this.showingPrivateContextMenuFor = null;
    } else {
      $('#contextMenu').hide();
    }
  }

}