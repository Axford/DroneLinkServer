


export default class UIManager {
  constructor() {
    var me = this;

    me.contextHandlers = {};
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
    item.widget.contextHandler(this.lngLat);
    this.hideContextMenu();
  }


  // map coordinates are in lngLat as .lat and .lng
  // screen coordinates relative to map div are in point.x and point.y
  showContextMenu(point, lngLat) {
    this.lngLat = lngLat;

    $('#contextMenu').show();
    $('#contextMenu').css({top:point.y, left:point.x});
  }


  hideContextMenu() {
    $('#contextMenu').hide();
  }

}