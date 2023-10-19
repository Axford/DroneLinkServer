/*

Manage a UI for charting param values

*/

import { format } from "https://cdn.skypack.dev/date-fns";
import * as DLM from "../droneLinkMsg.mjs";

export default class ChartManager {
  constructor(uiRoot, state) {
    var me = this;
    this.uiRoot = uiRoot;

    this.state = state;
    this.visible = false;

    this.active = true;

    this.lastRowTime = 0;

    this.charts = [];


    this.build();

    // param.value
    state.on("param.value", (data) => {
      //{ node: msg.node, channel:msg.channel, param: msg.param, msgType: msg.msgType, values:Array.from(msg.valueArray()), timestamp });

      // if a numeric value
      if (!(data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT || data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT32_T || data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT8_T)) return;

      // check each chart... 
      var f = false;
      me.charts.forEach((c)=>{
        // and each column of each chart for a match...
        for (const [key, col] of Object.entries(c.columns)) {
            if (col.node == data.node && col.channel == data.channel && col.param == data.param) {
                // add values to relevant column
                if (Array.isArray(data.values)) {
                    c.last[col.index] = data.values[0];
                } else {
                    c.last[col.index] = data.values;
                }
                
                f = true;
            }
        }
      });

      // if enough time has passed... add a row to all charts
      //var loopTime = Date.now();
      var loopTime = data.timestamp;
      if (f && loopTime >= me.lastRowTime + 1000) {
        me.addRows(data.timestamp);
      }
    });
  }

  show() {
    this.uiRoot.show();
    this.visible = true;
  }

  hide() {
    this.uiRoot.hide();
    this.visible = false; 
  }

  reset() {
    this.clear();

    
  }

  clear() {
    // clear datasets


  }

  addRows(timestamp) {
    var me = this;
    me.charts.forEach((c)=>{
        me.addRow(c, timestamp);
    });

    this.lastRowTime = timestamp;
  }

  addRow(chart, timestamp) {
    if (!this.active) return;

    // update time entry
    chart.last[0] = timestamp;

    // copy .last to create new row
    var newRow = _.clone(chart.last);

    //console.log('adding row', newRow);

    // push to rows
    chart.dataSet.append(newRow);
  }

  addColumn(chart, node, channel, param) {
    if (node.id == undefined  || channel.channel == undefined || param.param == undefined) return;
    
    // check we don't have this column already
    var f = false;
    chart.columns.every((c)=>{
      if (c.node == node.id && c.channel == channel.channel && c.param == param.param) {
        f = true;
        return false;
      }
    });

    if (f) {
        console.log('already have a matching column', chart.columns);
        return;
    } 

    // add new column
    var title = '';
    title += (node.name != '') ? node.name : node.id;
    title += '>';
    title += (channel.name != '?') ? channel.name : channel.channel;
    title += '.';
    title += (param.title != '?') ? param.name : param.param;

    var newCol = {
      index: chart.columns.length,
      node:node.id,
      channel:channel.channel,
      param:param.param,
      title: title
    };
    chart.columns.push(newCol);

    // check if we need to add another mapping and line (as the first one is initialised by default)
    if (chart.mappings.length < chart.columns.length-1) {
        chart.mappings.push(
            chart.dataSet.mapAs({x: 0, value: chart.columns.length-1})
        );

        chart.lines.push( chart.chart.line(chart.mappings[chart.mappings.length-1]) );
    }

    // set name
    chart.lines[chart.lines.length-1].name(title);

    // enable the legend
    chart.chart.legend(true);
    chart.chart.legend().itemsLayout("vertical-expandable");
    chart.chart.legend().positionMode("outside");
    chart.chart.legend().position("right");



    // sync .last
    if (Array.isArray(param.values)) {
        chart.last.push(param.values[0]);
    } else {
        chart.last.push(param.values);
    }

    // add column to dataset?
    //console.log('added column', newCol)
  }


  addChart() {
    var me = this;
    var c = {
        container: $('<div class="mb-3"></div>'),
        chart: anychart.line(),
        dataSet: anychart.data.set([]),
        columns: [{
            index: 0,
            node:0,
            channel:0,
            param:0,
            title: 'Time'
            }],
        mappings: [], // one per column (exc time)
        lines: [], // line references
        last: []
    };
    this.charts.push(c);

    this.uiRoot.append(c.container);

    c.container.resizable({
        containment: "parent"
      });
    c.container.droppable({
        accept: '.Parameter',
        drop: function(event, ui) {
            // lookup objects
            var obj = me.state.getObjectsForAddress(ui.draggable.data('node'), ui.draggable.data('channel'), ui.draggable.data('param'));

            //console.log(obj);

            me.addColumn(c, obj.node, obj.channel, obj.param);
        }
    });

    c.chart.container(c.container[0]);

    // create default mapping
    c.mappings.push(
        c.dataSet.mapAs({x: 0, value: 1})
    );

    c.lines.push( c.chart.line(c.mappings[0]) );

    var dateScale = anychart.scales.dateTime();
    c.chart.xScale(dateScale);

    c.chart.background().fill("#141a20");

    c.chart.draw();

    $('.anychart-credits').hide();
  }


  build() {
    var me = this;
    this.ui = {};
    
    // Nav
    // -----------------------------------------------------------------------
    var topNav = $('<div class="mb-3"></div>');
    this.uiRoot.append(topNav);

    this.ui.addButton = $('<button class="btn btn-primary mr-5"><i class="fas fa-plus mr-2"></i> Add</button>');
    this.ui.addButton.on('click', ()=>{
      me.addChart();
    });
    topNav.append(this.ui.addButton);


    this.ui.pauseButton = $('<button class="btn btn-primary mr-5"><i class="fas fa-pause mr-2"></i> Pause</button>');
    this.ui.pauseButton.on('click', ()=>{
      me.active = !me.active;
      if (me.active) {
        this.ui.pauseButton.html('<i class="fas fa-pause"></i> Pause');
        this.ui.pauseButton.addClass('btn-primary');
        this.ui.pauseButton.removeClass('btn-success');
      } else {
        this.ui.pauseButton.html('<i class="fas fa-play"></i> Capture');
        this.ui.pauseButton.removeClass('btn-danger');
        this.ui.pauseButton.addClass('btn-success');
      }
    });
    topNav.append(this.ui.pauseButton);

    this.ui.clearButton = $('<button class="btn btn-warning mr-3"><i class="fas fa-eraser mr-2"></i> Clear</button>');
    this.ui.clearButton.on('click', ()=>{
      me.clear();
    });
    topNav.append(this.ui.clearButton);

    this.ui.resetButton = $('<button class="btn btn-danger mr-5"><i class="fas fa-trash mr-2"></i> Reset</button>');
    this.ui.resetButton.on('click', ()=>{
      me.reset();
    });
    topNav.append(this.ui.resetButton);


    this.addChart();
  }
} // end of class
