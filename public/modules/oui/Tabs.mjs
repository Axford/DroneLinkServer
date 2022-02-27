export default class Tabs {

  constructor(uiParent) {
    this.uiParent = uiParent;

    this.tabCount = 0;

    this.callbacks = {}; // each key is an event type, values are an array of callback functions
  }


  on(name, cb) {
    if (!this.callbacks.hasOwnProperty(name)) {
      this.callbacks[name] = [];
    }
    this.callbacks[name].push(cb);
  }


  trigger(name, param) {
    if (this.callbacks[name]) {
      this.callbacks[name].forEach((cb)=>{
        //console.log('trigger('+name+'): ', param);
        cb(param);
      })
    }
  }


  add(name, title, content) {
    var me = this;
    //add('NodeSettings', 'UI Settings', '<i class="fas fa-cog"></i>');

    var style = 'inactive';
    var tab = $('<a class="tab '+style+'" title="'+title+'">'+content+'</a>');
    tab.data('tab',name);

    this.uiParent.append(tab);

    tab.on('click', function() {
      var tabName = $(this).data('tab');
      me.selectTab(tabName);
    });

    this.tabCount++;
  }


  selectTab(tabName) {
    // restyle buttons
    this.uiParent.children().each(function () {
      //console.log($(this).data('tab'), tabName);
      if ($(this).data('tab') == tabName) {
        $(this).removeClass('inactive');
        $(this).addClass('active');
      } else {
        $(this).removeClass('active');
        $(this).addClass('inactive');
      }
    });

    this.trigger('select', tabName);
  }

}
