/*

Manage a UI for charting param values

*/

import { format } from "https://cdn.skypack.dev/date-fns";
import * as DLM from "../droneLinkMsg.mjs";
import Vector from "../Vector.mjs";
import roundRect from "../RoundedRect.mjs";
import { clamp } from "../navMath.mjs";
import LineChart from "./LineChart.mjs";
import ScatterChart from "./ScatterChart.mjs";
import PolarChart from "./PolarChart.mjs";


export default class ChartManager {
  constructor(uiRoot, state) {
    var me = this;
    this.uiRoot = uiRoot;

    this.state = state;
    this.visible = false;

    this.active = true;
    this.lastUpdate = Date.now();

    this.lastRowTime = 0;

    this.paramData = {};
    this.charts = [];

    this.startTime = 0;
    this.endTime = 0;
    this.selectedStartTime = 0;
    this.selectedEndTime = 0;
    this.timeSelectHandle = "";
    this.autoTrack = true; // move selected timeframe automatically

    this.haveData = false;

    this.frame = 0;
    this.fps = 0;
    this.drawTime = 0;
    this.needsRedraw = true;

    this.mx = 0; // last mouse position
    this.my = 0;

    this.chartSpacing = 10;
    this.legendSpacing = 10;

    this.timeHeight = 50; // time selection region

    this.axesWidth = 65; // area for labelling axis
    this.axesHeight = 1;
    this.legendWidth = 160;
    this.legendLabelHeight = 40;

    this.mouseInteractionHandler = null; // assigned by individual UI elements when interaction starts

    this.seperatorDragStart = new Vector(0, 0);

    this.baseFont =
      '-apple-system, "system-ui", "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';
    this.font = "12px normal, " + this.baseFont;

    this.build();

    // param.value
    state.on("param.value", (data) => {
      //{ node: msg.node, channel:msg.channel, param: msg.param, msgType: msg.msgType, values:Array.from(msg.valueArray()), timestamp });

      if (!me.active) return;

      // check it's not in the past!
      if (data.timestamp < me.endTime && me.haveData) return;

      // if a numeric value
      if (
        !(
          data.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT ||
          data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT32_T ||
          data.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT8_T
        )
      )
        return;

      // addr
      var addr = data.node + ">" + data.channel + "." + data.param;

      // check for each value in data.values
      if (!Array.isArray(data.values)) data.values = [data.values]; // sanity

      data.values.forEach((v, vi) => {
        // check each paramData
        var pAddr = addr + "." + vi;

        for (const [key, pd] of Object.entries(me.paramData)) {
          if (key == pAddr) {
            // add data

            pd.data.push({
              t: data.timestamp,
              v: v,
            });

            if (!me.haveData) {
              me.haveData = true;

              // init time ranges
              me.startTime = data.timestamp;
              me.endTime = data.timestamp;
              me.selectedStartTime = data.timestamp;
              me.selectedEndTime = data.timestamp;
            } else {
              // update time ranges
              if (data.timestamp > me.endTime) {
                me.endTime = data.timestamp;
                if (me.autoTrack) me.selectedEndTime = data.timestamp;
              }
            }

            // update ranges
            pd.minValue = Math.min(pd.minValue, v);
            pd.maxValue = Math.max(pd.maxValue, v);

            me.needsRedraw = true;
          }
        }
      });
    });
  }

  show() {
    this.uiRoot.show();
    this.visible = true;
    this.resize();
    this.update();
  }

  hide() {
    this.uiRoot.hide();
    this.visible = false;
  }

  reset() {
    this.clear();

    this.paramData = {};
    this.charts = [];
  }

  clear() {
    // clear paramData

    for (const [key, pd] of Object.entries(this.paramData)) {
      pd.data = [];
    }

    this.haveData = false;

    this.needsRedraw = true;
  }

  trim() {
    // delete paramData outside selected time frame
    for (const [key, pd] of Object.entries(this.paramData)) {
      console.log("before", key, pd.data.length);
      //pd.data = [];
      var startIndex = 0;
      var endIndex = pd.data.length - 1;
      for (var i = 0; i < pd.data.length; i++) {
        if (pd.data[i].t < this.selectedStartTime) {
          startIndex = i;
        } else if (pd.data[i].t > this.selectedEndTime) {
          endIndex = i + 1;
          break;
        }
      }
      pd.data = pd.data.slice(startIndex, endIndex);

      console.log("after", key, pd.data.length);
    }

    // reset time markers
    this.startTime = this.selectedStartTime;
    this.endTime = this.selectedEndTime;

    this.needsRedraw = true;
  }

  addColumn(chart, y, node, channel, param, valueIndex) {
    if (
      node.id == undefined ||
      channel.channel == undefined ||
      param.param == undefined
    )
      return;

    var addr =
      node.id + ">" + channel.channel + "." + param.param + "." + valueIndex;

    // check we don't have this column already
    var f = false;
    var paramData = null;
    for (const [key, pd] of Object.entries(this.paramData)) {
      if (pd.addr == addr) {
        f = true;
        paramData = pd;
      }
    }

    if (!f) {
      // add new column
      var title = "";
      title += node.name != "" ? node.name : node.id;
      title += ">";
      title += channel.name != "?" ? channel.name : channel.channel;
      title += ".";
      title += param.title != "?" ? param.name : param.param;

      paramData = {
        addr: addr,
        node: node.id,
        channel: channel.channel,
        param: param.param,
        valueIndex: valueIndex, // which value is this param related to
        nodeObj: node,
        channelObj: channel,
        paramObj: param,
        title: title,
        data: [],
        minValue: 0,
        maxValue: 0,
      };
      this.paramData[addr] = paramData;
    }

    // make sure the new/existing column is associated with the chart
    chart.addParam(y, paramData);

    this.needsRedraw = true;
  }

  addChart(type) {
    var y = this.timeHeight;
    if (this.charts.length > 0)
        y = this.charts[this.charts.length-1].y + this.charts[this.charts.length-1].height + this.chartSpacing;

    if (type == 'line') {
        this.charts.push( new LineChart(this, y) );
    } else if (type == 'scatter') {
        this.charts.push( new ScatterChart(this, y) );
    } else if (type == 'polar') {
        this.charts.push( new PolarChart(this, y) );
    }

    this.needsRedraw = true;
  }

  getChartAt(x, y) {
    var match = null;
    this.charts.forEach((c) => {
      var h1 = c.height;

      if (y >= c.y && y <= c.y + c.height) {
        match = c;
      }
    });
    return match;
  }

  getSeperatorAt(x, y) {
    var match = null;
    this.charts.forEach((c) => {
      if (y >= c.y + c.height && y <= c.y + c.height + this.chartSpacing) {
        match = c;
      }
    });
    return match;
  }

  seperatorMouseHover(x, y) {
    this.hoverSeperator = this.getSeperatorAt(x, y);
  }

  seperatorMouseDown(x, y) {
    var match = this.getSeperatorAt(x, y);

    if (match) {
      this.dragSeperator = match;
      //console.log('sep start', this.dragSeperator);

      this.seperatorDragStart.x = x;
      this.seperatorDragStart.y = y;
      this.seperatorStartHeight = match.height;

      // set cursor
      this.ui.canvas.css("cursor", "ns-resize");

      return this.seperatorInteractionHandler;
    }
    return null;
  }

  seperatorInteractionHandler(type, x, y) {
    if (type == "move" && this.dragSeperator) {
      var h1 = y - this.seperatorDragStart.y + this.seperatorStartHeight;
      h1 = Math.max(h1, 50);
      this.dragSeperator.height = h1;
      this.dragSeperator.resize();
    } else if (type == "up") {
      this.dragSeperator = null;
      this.ui.canvas.css("cursor", "pointer");
    }
  }

  timeSelectMouseDown(x, y) {
    var w = this.ctx.canvas.width;
    var x1 = this.axesWidth;
    var cw = w - this.legendWidth - x1; // chart area

    var timeOuterRange = this.endTime - this.startTime;
    if (timeOuterRange == 0) timeOuterRange = 1;

    var th1 = 20;

    // draw selected region
    var sx1 =
      x1 + (cw * (this.selectedStartTime - this.startTime)) / timeOuterRange;
    var sx2 =
      x1 + (cw * (this.selectedEndTime - this.startTime)) / timeOuterRange;

    if (y < th1) {
      // left handle
      if (x >= sx1 - this.chartSpacing && x <= sx1) {
        this.timeSelectHandle = "start";
        return this.timeSelectInteractionHandler;
      } else if (x >= sx2 && x <= sx2 + this.chartSpacing) {
        this.timeSelectHandle = "end";
        this.autoTrack = false;
        return this.timeSelectInteractionHandler;
      }
    }
    this.timeSelectHandle = "";
    return null;
  }

  timeSelectInteractionHandler(type, x, y) {
    var w = this.ctx.canvas.width;
    var x1 = this.axesWidth;
    var cw = w - this.legendWidth - x1; // chart area

    if (type == "move") {
      var timeOuterRange = this.endTime - this.startTime;
      if (timeOuterRange == 0) timeOuterRange = 1;

      var th1 = 20;

      // draw selected region
      var sx1 =
        x1 + (cw * (this.selectedStartTime - this.startTime)) / timeOuterRange;
      var sx2 =
        x1 + (cw * (this.selectedEndTime - this.startTime)) / timeOuterRange;

      if (this.timeSelectHandle == "start") {
        var v = this.startTime + ((x - x1) * timeOuterRange) / cw;
        if (v < this.startTime) v = this.startTime;
        if (v > this.selectedEndTime) v = this.selectedEndTime - 1;
        this.selectedStartTime = v;
      } else if (this.timeSelectHandle == "end") {
        var v = this.startTime + ((x - x1) * timeOuterRange) / cw;
        if (v < this.selectedStartTime) v = this.selectedStartTime + 1;
        if (v >= this.endTime) {
          v = this.endTime;
        }
        this.selectedEndTime = v;
      }
    } else if (type == "up") {
      console.log(x);
      // enable autotrack?
      if (x >= x1 + cw) {
        this.autoTrack = true;
        console.log("autoTrack");
      }
    }
  }

  getLabelAt(x, y) {
    var match = null;
    this.charts.forEach((c) => {
        if (!match) match = c.getLabelAt(x,y);
    });
    return match;
  }

  labelMouseHover(x, y) {
    this.hoverLabel = this.getLabelAt(x, y);
  }

  labelMouseDown(x, y) {
    var match = this.getLabelAt(x, y);

    if (match) {
      this.dragLabel = match;
      //console.log('sep start', this.dragSeperator);

      this.labelDragStart = y;
      this.labelDragOffset = y - match.chart.y - match.position;

      // set cursor
      this.ui.canvas.css("cursor", "grab");

      return this.labelInteractionHandler;
    }
    return null;
  }

  labelInteractionHandler(type, x, y) {
    if (type == "move" && this.dragLabel) {
      this.dragLabel.position =
        y - this.labelDragOffset - this.dragLabel.chart.y;

      //var h1 = y - this.seperatorDragStart.y + this.seperatorStartHeight;
      //h1 = Math.max(h1, 50);
      //this.dragLabel.height = h1;
    } else if (type == "up" && this.dragLabel) {
      // have we been dragged over a different chart?
      var c = this.getChartAt(x, y);
      if (c && c != this.dragLabel.chart) {
        // remove from old chart
        this.dragLabel.chart.removeParam(this.dragLabel);
        //delete this.dragLabel.chart.columns[this.dragLabel.addr];
        //this.dragLabel.chart.numColumns--;

        // add to new chart
        c.addParam(y, this.paramData[this.dragLabel.addr]);
        /*
        c.columns[this.dragLabel.addr] = this.dragLabel;
        this.dragLabel.chart = c;
        
        this.dragLabel.position =
        y - this.labelDragOffset - this.dragLabel.chart.y;
        */

        c.numColumns++;
      } else if (c == null) {
        // or even outside the valid chart areas?
        // remove this col from the source chart
        this.dragLabel.chart.removeParam(this.dragLabel);
        //delete this.dragLabel.chart.columns[this.dragLabel.addr];
        //this.dragLabel.chart.numColumns--;
      }

      this.dragLabel = null;
      this.ui.canvas.css("cursor", "pointer");
    }
  }

  build() {
    var me = this;
    this.ui = {};

    // Nav
    // -----------------------------------------------------------------------
    var topNav = $('<div class="mb-3"></div>');
    this.uiRoot.append(topNav);

    this.ui.addLineButton = $(
      '<button class="btn btn-primary mr-1"><i class="fas fa-plus mr-2"></i> Line</button>'
    );
    this.ui.addLineButton.on("click", () => {
      me.addChart("line");
    });
    topNav.append(this.ui.addLineButton);

    this.ui.addScatterButton = $(
      '<button class="btn btn-primary mr-1"><i class="fas fa-plus mr-2"></i> Scatter</button>'
    );
    this.ui.addScatterButton.on("click", () => {
      me.addChart("scatter");
    });
    topNav.append(this.ui.addScatterButton);

    this.ui.addPolarButton = $(
        '<button class="btn btn-primary mr-5"><i class="fas fa-plus mr-2"></i> Polar</button>'
      );
      this.ui.addPolarButton.on("click", () => {
        me.addChart("polar");
      });
      topNav.append(this.ui.addPolarButton);

    this.ui.pauseButton = $(
      '<button class="btn btn-primary mr-5"><i class="fas fa-pause mr-2"></i> Pause</button>'
    );
    this.ui.pauseButton.on("click", () => {
      me.active = !me.active;
      if (me.active) {
        this.ui.pauseButton.html('<i class="fas fa-pause"></i> Pause');
        this.ui.pauseButton.addClass("btn-primary");
        this.ui.pauseButton.removeClass("btn-success");
      } else {
        this.ui.pauseButton.html('<i class="fas fa-play"></i> Capture');
        this.ui.pauseButton.removeClass("btn-danger");
        this.ui.pauseButton.addClass("btn-success");
      }
    });
    topNav.append(this.ui.pauseButton);

    this.ui.trimButton = $(
      '<button class="btn btn-warning mr-1"><i class="fas fa-cut"></i> Trim</button>'
    );
    this.ui.trimButton.on("click", () => {
      me.trim();
    });
    topNav.append(this.ui.trimButton);

    this.ui.clearButton = $(
      '<button class="btn btn-warning mr-1"><i class="fas fa-eraser mr-2"></i> Clear</button>'
    );
    this.ui.clearButton.on("click", () => {
      me.clear();
    });
    topNav.append(this.ui.clearButton);

    this.ui.resetButton = $(
      '<button class="btn btn-danger mr-5"><i class="fas fa-trash mr-2"></i> Reset</button>'
    );
    this.ui.resetButton.on("click", () => {
      me.reset();
    });
    topNav.append(this.ui.resetButton);

    // Canvas
    // -----------------------------------------------------------------------

    this.ui.canvas = $("<canvas width=100 height=100></canvas>");

    this.ui.canvas.droppable({
      accept: ".Parameter",
      drop: function (event, ui) {
        // lookup objects
        var obj = me.state.getObjectsForAddress(
          ui.draggable.data("node"),
          ui.draggable.data("channel"),
          ui.draggable.data("param")
        );

        // work out which chart element this has been dropped on
        var offsetX = ui.position.left - $(this).offset().left;
        var offsetY = ui.position.top - $(this).offset().top;

        //console.log(offsetX, offsetY, obj);

        me.charts.forEach((c) => {
          if (offsetY > c.y && offsetY < c.y + c.height) {
            // for each value
            for (var j = 0; j < obj.param.values.length; j++) {
              me.addColumn(c, offsetY, obj.node, obj.channel, obj.param, j);
            }
          }
        });

        me.needsRedraw = true;
      },
    });

    this.ui.canvas.on("mousedown", (e) => {
      var offsetX = $(e.target).offset().left;
      var offsetY = $(e.target).offset().top;
      var w = $(e.target).innerWidth();
      var h = $(e.target).innerHeight();

      var x1 = e.pageX - offsetX;
      var y1 = e.pageY - offsetY;

      me.mouseInteractionHandler = me.seperatorMouseDown(x1, y1);
      if (!me.mouseInteractionHandler)
        me.mouseInteractionHandler = me.timeSelectMouseDown(x1, y1);
      if (!me.mouseInteractionHandler)
        me.mouseInteractionHandler = me.labelMouseDown(x1, y1);

      me.needsRedraw = true;
    });

    this.ui.canvas.on("mousemove", (e) => {
      var offsetX = $(e.target).offset().left;
      var offsetY = $(e.target).offset().top;
      var w = $(e.target).innerWidth();
      var h = $(e.target).innerHeight();

      var x1 = e.pageX - offsetX;
      var y1 = e.pageY - offsetY;

      this.mx = x1;
      this.my = y1;

      if (me.mouseInteractionHandler) {
        me.mouseInteractionHandler("move", x1, y1);
      } else {
        me.seperatorMouseHover(x1, y1);
        me.labelMouseHover(x1, y1);
      }

      me.needsRedraw = true;
    });

    this.ui.canvas.on("mouseup", (e) => {
      var offsetX = $(e.target).offset().left;
      var offsetY = $(e.target).offset().top;
      var w = $(e.target).innerWidth();
      var h = $(e.target).innerHeight();

      var x1 = e.pageX - offsetX;
      var y1 = e.pageY - offsetY;

      if (me.mouseInteractionHandler) {
        me.mouseInteractionHandler("up", x1, y1);

        me.mouseInteractionHandler = null;
      }

      me.needsRedraw = true;
    });

    this.uiRoot.append(this.ui.canvas);

    this.ctx = this.ui.canvas[0].getContext("2d", { alpha: false });

    //this.addChart('line');

    this.resize(); // will trigger a redraw

    this.update();
  }

  resize() {
    // keep width updated
    var w = this.uiRoot.width();
    this.ctx.canvas.width = w - 20;
    var h = this.uiRoot.height();
    this.ctx.canvas.height = h - 80;

    this.needsRedraw = true;
  }

  update() {
    if (this.visible) {
      this.frame++;
      var loopTime = Date.now();
      this.fps = this.frame / ((loopTime - this.startTime) / 1000);

      var t1 = performance.now();

      this.updateLegendPositions();

      this.draw();

      var t2 = performance.now();
      var dt2 = t2 - t1;
      this.drawTime = (9 * this.drawTime + dt2) / 10;
    }

    window.requestAnimationFrame(this.update.bind(this));
  }

  updateLegendPositions() {
    if (!this.haveData) return;

    this.charts.forEach((c) => {
      if (c.updateLegendPositions())
        this.needsRedraw = true;
    });
  }

  draw() {
    var me = this;
    if (!this.needsRedraw) return false;
    this.needsRedraw = false;

    var w = this.ctx.canvas.width;
    var cx = w / 2;

    var h = this.ctx.canvas.height;
    var cy = h / 2;

    // background
    this.ctx.fillStyle = "#242a30";
    this.ctx.fillRect(0, 0, w, h);

    var x1 = this.axesWidth;
    var y1 = 0;
    var cw = w - this.legendWidth - x1; // chart area

    var timeOuterRange = this.endTime - this.startTime;
    if (timeOuterRange == 0) timeOuterRange = 1;

    var timeRange = this.selectedEndTime - this.selectedStartTime;
    if (timeRange == 0) timeRange = 1;

    // draw time axis and selection region
    // ------------------------------------------------------------
    // background
    var th1 = 20;
    this.ctx.fillStyle = "#141a20";
    this.ctx.fillRect(x1, 0, cw, this.timeHeight);

    // draw selected region
    var sx1 =
      x1 + (cw * (this.selectedStartTime - this.startTime)) / timeOuterRange;
    var sx2 =
      x1 + (cw * (this.selectedEndTime - this.startTime)) / timeOuterRange;
    this.ctx.fillStyle = "#242a40";
    this.ctx.fillRect(sx1, 0, sx2 - sx1, th1);

    // draw expansion to full area
    this.ctx.beginPath();
    this.ctx.moveTo(sx2, th1);
    this.ctx.lineTo(w - this.legendWidth, this.timeHeight);
    this.ctx.lineTo(x1, this.timeHeight);
    this.ctx.lineTo(sx1, th1);
    this.ctx.fill();
    this.ctx.strokeStyle = "#888";
    this.ctx.stroke();

    // drag handles
    this.ctx.fillStyle = "#888";
    this.ctx.fillRect(sx1 - this.chartSpacing, 0, this.chartSpacing, th1);
    this.ctx.fillStyle = this.autoTrack ? "#007bff" : "#888";
    this.ctx.fillRect(sx2, 0, this.chartSpacing, th1);

    // label Y Axis
    this.ctx.fillStyle = "#888";
    this.ctx.font = this.font;
    var ty = y1 + this.timeHeight - 5;

    // start
    this.ctx.textAlign = "right";
    this.ctx.fillText(
      format(this.startTime, "HH:mm:ss"),
      x1 - this.chartSpacing - 2,
      10
    );
    // end
    this.ctx.textAlign = "left";
    this.ctx.fillText(
      format(this.endTime, "HH:mm:ss"),
      x1 + cw + this.chartSpacing + 2,
      10
    );

    this.ctx.textAlign = "right";
    // selection start
    this.ctx.fillText(format(this.selectedStartTime, "HH:mm:ss"), x1 - 2, ty);
    // selection end
    this.ctx.textAlign = "left";
    this.ctx.fillText(
      format(this.selectedEndTime, "HH:mm:ss"),
      w - this.legendWidth + 2,
      ty
    );

    // draw charts
    // ------------------------------------------------------------
    y1 = this.timeHeight;

    this.charts.forEach((c) => {
      c.y = y1;

      c.draw();

      y1 += c.height + this.chartSpacing;
    });
  }

  

  
} // end of class
