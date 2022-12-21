

export default class AnalysisManager {

  constructor(ui, state) {
    this.ui = ui;
    this.state = state;
    this.visible = false;

    this.nodes = {};

    this.needsRedraw = false;
    this.numPackets = 0;
    this.maxPackets = 0;
    this.startTime = Date.now();

    // node.new
    state.on('node.new', (node)=>{
      if (!this.nodes.hasOwnProperty(node)) {
        var ele = $('<div class="analysisNode"></div>');
        var title = $('<div class="analysisNodeTitle">'+node+'. </div>');
        ele.append(title);
        var contents = $('<div class="analysisNodeContents"></div>');
        ele.append(contents);

        this.nodes[node] = {
          node:node,
          name:'',
          title:title,
          ui:ele,
          contents:contents,
          maxPackets:0,
          channels: {},
          priorityCounts: [0,0,0,0]
        };
        this.ui.append(ele);
      }
    });

    // module.new
    state.on('module.new', (data)=>{
      //{ node: msg.node, channel:msg.channel });
      var node = this.nodes[data.node];
      if (node) {
        if (!node.channels.hasOwnProperty(data.channel)) {
          var ele = $('<div class="analysisModule"></div>');
          var title = $('<div class="analysisModuleTitle">'+data.channel+'. </div>');
          ele.append(title);
          var contents = $('<div class="analysisModuleContents"></div>');
          ele.append(contents);

          node.channels[data.channel] = {
            channel:data.channel,
            name: '',
            ui:ele,
            title:title,
            contents:contents,
            maxPackets:0,
            params: {}
          };
          node.contents.append(ele);
        }
      }
    });

    // param.value
    state.on('param.value', (data)=>{
      //{ node: msg.node, channel:msg.channel, param: msg.param, msgType: msg.msgType, values:Array.from(msg.valueArray()) });

      var node = this.nodes[data.node];
      if (node) {
        var channel = node.channels[data.channel];
        if (channel) {
          if (!channel.params.hasOwnProperty(data.param)) {
            var ele = $('<div class="analysisParam"></div>');
            var title = $('<div class="analysisParamTitle">'+data.param+'. </div>');
            ele.append(title);

            var priority = $('<div class="analysisParamPriority analysisParamPriority'+data.priority+'">'+data.priority+'</div>');
            ele.append(priority);

            var info = $('<div class="analysisParamInfo"></div>');
            ele.append(info);

            var v = 100 * 1 / this.maxPackets;

            var graph = $('<div class="analysisParamBarGraph"><div class="analysisParamBar" style="width:'+v+'%"></div></div>');
            ele.append(graph);

            if (data.param < 8) {
              ele.hide();
            }

            channel.params[data.param] = {
              param:data.param,
              priority: priority,
              name: '',
              ui:ele,
              title:title,
              info:info,
              graph:graph,
              packets:0
            };
            channel.contents.append(ele);
          }

          var param = channel.params[data.param];

          param.packets++;
          this.numPackets++;
          this.maxPackets = Math.max(this.maxPackets, param.packets);
          param.ui.data('packets', param.packets);

          node.priorityCounts[data.priority]++;
          
          node.maxPackets = Math.max(node.maxPackets, param.packets);
          node.ui.data('packets', node.maxPackets);

          channel.maxPackets = Math.max(channel.maxPackets, param.packets);
          channel.ui.data('packets', channel.maxPackets);

          this.needsRedraw = true;
        }
      }
    });


    // param name
    state.on('param.name', (data)=>{
      //{ node: msg.node, channel:msg.channel, param: msg.param, msgType: msg.msgType, name: msg.payloadToString() });
      // param.value

      var node = this.nodes[data.node];
      if (node) {
        var channel = node.channels[data.channel];
        if (channel) {
          var param = channel.params[data.param];
          if (param) {
            param.name = data.name;
            param.title.html(param.param + '. '+data.name);
          }

          this.needsRedraw = true;
        }
      }
    });

    // module name
    state.on('module.name', (data)=>{
      //me.trigger('module.name', { node: msg.node, channel:msg.channel, name:msg.valueArray()[0] });

      var node = this.nodes[data.node];
      if (node) {
        var channel = node.channels[data.channel];
        if (channel) {
          channel.name = data.name;
          channel.title.html(channel.channel + '. '+data.name);

          this.needsRedraw = true;
        }
      }
    });

    // redraw
    setInterval(()=>{
      if (this.needsRedraw && this.visible) {

        var dt = (Date.now() - this.startTime) / 1000;

        if (this.maxPackets == 0 ) return;

        // sort nodes
        var children = this.ui.children();
        var sortList = Array.prototype.sort.bind(children);
        sortList((a,b)=>{
          return $(b).data('packets') - $(a).data('packets');
        });
        this.ui.append(children);


        // update barGraphs
        //for each node
        for (const [nodeId, node] of Object.entries(this.nodes)) {

          // sort channel
          var children = node.contents.children();
          var sortList = Array.prototype.sort.bind(children);
          sortList((a,b)=>{
            return $(b).data('packets') - $(a).data('packets');
          });
          node.contents.append(children);

          // for each channel
          for (const [channelId, channel] of Object.entries(node.channels)) {

            // sort params
            var children = channel.contents.children();
            var sortList = Array.prototype.sort.bind(children);
            sortList((a,b)=>{
              return $(b).data('packets') - $(a).data('packets');
            });
            channel.contents.append(children);

            // for each param
            for (const [paramId, param] of Object.entries(channel.params)) {

              // only show params with packets > 0 and hide mgmt params
              if (param.packets > 0 && param.param > 7) {
              //if (param.packets > 0) {
                param.ui.show();
                // update barGraph
                var v = 100 * param.packets / this.maxPackets;

                param.graph.children().css('width', v + '%');

                // update info
                var s = param.packets + ', ' + (param.packets / dt).toFixed(1) + '/s';
                param.info.html(s);
              } else {
                param.ui.hide();
              }
            }
          }
        }


        this.needsRedraw = false;
      }
    }, 5000);

  }


  reset() {

    this.maxPackets = 0;
    this.numPackets = 0;
    this.startTime = Date.now();

    // update barGraphs
    //for each node
    for (const [nodeId, node] of Object.entries(this.nodes)) {
      node.maxPackets = 0;
      node.ui.data('packets', 0);

      // for each channel
      for (const [channelId, channel] of Object.entries(node.channels)) {
        channel.maxPackets = 0;
        channel.ui.data('packets', 0);

        // for each param
        for (const [paramId, param] of Object.entries(channel.params)) {
          param.packets = 0;
          param.ui.data('packets', 0);
          param.graph.children().css('width','0%');
        }
      }
    }

    this.needsRedraw = true;
  }


}
