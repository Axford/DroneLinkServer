/*

Manage a UI for charting param values

*/

import { format } from "https://cdn.skypack.dev/date-fns";
import * as DLM from "../droneLinkMsg.mjs";
import Vector from '../Vector.mjs';
import roundRect from '../RoundedRect.mjs';

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
    this.timeSelectHandle = '';
    this.autoTrack = true; // move selected timeframe automatically

    this.haveData = false;

    this.frame = 0;
    this.fps = 0;
    this.drawTime = 0;
    this.needsRedraw = true;

    this.chartSpacing = 10;
    this.legendSpacing = 10;

    this.timeHeight = 50; // time selection region

    this.axesWidth = 65; // area for labelling axis
    this.axesHeight = 1;
    this.legendWidth = 160;
    this.legendLabelHeight = 40;

    this.mouseInteractionHandler = null;  // assigned by individual UI elements when interaction starts

    this.seperatorDragStart = new Vector(0,0);

    this.baseFont =
      '-apple-system, "system-ui", "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';
    this.font = "12px normal, " + this.baseFont;

    this.build();

    // param.value
    state.on("param.value", (data) => {
      //{ node: msg.node, channel:msg.channel, param: msg.param, msgType: msg.msgType, values:Array.from(msg.valueArray()), timestamp });

      if (!me.active) return;

      // check it's not in the past!
      if (data.timestamp < me.endTime) return;

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

    this.addChart();
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
        console.log('before', key, pd.data.length);
        //pd.data = [];
        var startIndex = 0;
        var endIndex = pd.data.length-1;
        for (var i=0; i<pd.data.length; i++) {
            if (pd.data[i].t < this.selectedStartTime) {
                startIndex = i;
            } else if (pd.data[i].t > this.selectedEndTime) {
                endIndex = i+1;
                break;
            }
        }
        pd.data = pd.data.slice(startIndex, endIndex);

        console.log('after', key, pd.data.length);
    }

    // reset time markers
    this.startTime = this.selectedStartTime;
    this.endTime = this.selectedEndTime;

    this.needsRedraw = true;
  }

  addColumn(chart, node, channel, param, valueIndex) {
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
    if (!chart.columns.hasOwnProperty(addr)) {
      chart.numColumns++;

      var hue = (chart.numColumns * 67) % 360;

      chart.columns[addr] = {
        title: paramData.title,
        addr: addr,
        style: "hsl(" + hue + "," + "100%," + 75 + "%)",
        position: (chart.numColumns-1) * (this.legendLabelHeight + this.legendSpacing),
        velocity: 0,
        av: 0
      };
    }

    this.needsRedraw = true;
  }

  addChart() {
    var me = this;
    var c = {
      height: 300, // height
      numColumns: 0,
      columns: {},
    };
    this.charts.push(c);

    /*
    c.container.resizable({
        containment: "parent"
      });
    */

    this.needsRedraw = true;
  }

  getSeperatorAt(x,y) {
    var match = null;
    this.charts.forEach((c) => {
      var h1 = c.height - this.axesHeight; // chart area`

      if (y >= c.y + c.height && y <= c.y + c.height+this.chartSpacing) {
        match = c;
      }
    });
    return match;
  }

  seperatorMouseHover(x,y) {
    this.hoverSeperator = this.getSeperatorAt(x,y);
  }

  seperatorMouseDown(x,y) {
    var match = this.getSeperatorAt(x,y);

    if (match) {
        this.dragSeperator = match;
        //console.log('sep start', this.dragSeperator);

        this.seperatorDragStart.x = x;
        this.seperatorDragStart.y = y;
        this.seperatorStartHeight = match.height;

        // set cursor
        this.ui.canvas.css('cursor', 'ns-resize');

        return this.seperatorInteractionHandler;
    }
    return null;
  }

  seperatorInteractionHandler(type, x, y) {
    if (type == 'move' && this.dragSeperator) {
        var h1 = (y-this.seperatorDragStart.y) + this.seperatorStartHeight;
        h1 = Math.max(h1, 50);
        this.dragSeperator.height = h1;
        
    } else if (type == 'up') {
        this.dragSeperator = null;
        this.ui.canvas.css('cursor', 'pointer');
    }
  }


  timeSelectMouseDown(x,y) {
    var w = this.ctx.canvas.width;
    var x1 = this.axesWidth;
    var cw = w - this.legendWidth - x1; // chart area

    var timeOuterRange = this.endTime - this.startTime;
    if (timeOuterRange == 0) timeOuterRange = 1;
    
    var th1 = 20;
    
    // draw selected region
    var sx1 = x1 + (cw * (this.selectedStartTime - this.startTime)) / timeOuterRange;
    var sx2 = x1 + (cw * (this.selectedEndTime - this.startTime)) / timeOuterRange;
    
    if (y < th1) {
        // left handle
        if (x >= sx1 - this.chartSpacing && x <= sx1 ) {
            this.timeSelectHandle = 'start';
            return this.timeSelectInteractionHandler;
        } else if (x >= sx2 && x <= sx2 + this.chartSpacing ) {
            this.timeSelectHandle = 'end';
            this.autoTrack = false;
            return this.timeSelectInteractionHandler;
        }
    }
    this.timeSelectHandle = '';
    return null;
  }

  timeSelectInteractionHandler(type, x, y) {
    var w = this.ctx.canvas.width;
    var x1 = this.axesWidth;
    var cw = w - this.legendWidth - x1; // chart area

    if (type == 'move') {
        var timeOuterRange = this.endTime - this.startTime;
        if (timeOuterRange == 0) timeOuterRange = 1;
        
        var th1 = 20;
        
        // draw selected region
        var sx1 = x1 + (cw * (this.selectedStartTime - this.startTime)) / timeOuterRange;
        var sx2 = x1 + (cw * (this.selectedEndTime - this.startTime)) / timeOuterRange;
        
        if (this.timeSelectHandle == 'start') {
            var v = this.startTime + ((x - x1) * timeOuterRange) / cw;
            if (v < this.startTime) v = this.startTime;
            if (v > this.selectedEndTime) v = this.selectedEndTime-1;
            this.selectedStartTime = v;
        } else if (this.timeSelectHandle == 'end') {
            var v = this.startTime + ((x - x1) * timeOuterRange) / cw;
            if (v < this.selectedStartTime) v = this.selectedStartTime+1;
            if (v >= this.endTime) {
                v = this.endTime;
            }
            this.selectedEndTime = v;

        }
    } else if (type == 'up') {
        console.log(x);
        // enable autotrack?
        if (x >= x1 + cw) {
            this.autoTrack = true;
            console.log('autoTrack');
        }
    }
  }

  build() {
    var me = this;
    this.ui = {};

    // Nav
    // -----------------------------------------------------------------------
    var topNav = $('<div class="mb-3"></div>');
    this.uiRoot.append(topNav);

    this.ui.addButton = $(
      '<button class="btn btn-primary mr-5"><i class="fas fa-plus mr-2"></i> Add</button>'
    );
    this.ui.addButton.on("click", () => {
      me.addChart();
    });
    topNav.append(this.ui.addButton);

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

        var y1 = 0;
        me.charts.forEach((c) => {
          var h1 = c.height;

          if (offsetY > y1 && offsetY < y1 + h1) {
            me.addColumn(c, obj.node, obj.channel, obj.param, 0);
          }

          y1 += c.height + me.chartSpacing;
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

      me.mouseInteractionHandler = me.seperatorMouseDown(x1,y1);
      if (!me.mouseInteractionHandler) 
        me.mouseInteractionHandler = me.timeSelectMouseDown(x1,y1);
      
      me.needsRedraw = true;
    });

    this.ui.canvas.on("mousemove", (e) => {
      var offsetX = $(e.target).offset().left;
      var offsetY = $(e.target).offset().top;
      var w = $(e.target).innerWidth();
      var h = $(e.target).innerHeight();

      var x1 = e.pageX - offsetX;
      var y1 = e.pageY - offsetY;

      if (me.mouseInteractionHandler) {
        me.mouseInteractionHandler('move', x1, y1);
      } else {
        me.seperatorMouseHover(x1,y1);
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
            me.mouseInteractionHandler('up', x1, y1);

            me.mouseInteractionHandler = null;
        }
        
        me.needsRedraw = true;
    });

    this.uiRoot.append(this.ui.canvas);

    this.ctx = this.ui.canvas[0].getContext("2d", { alpha: false });

    this.addChart();

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

  legendOverlap(b, ob, padding) {
    var v = 0;
    // overlap values will be positive if overlapping
    var yo1 = (ob.position + this.legendLabelHeight + padding) - b.position;
    var yo2 = (b.position + + this.legendLabelHeight + padding) - ob.position;
    if (yo1 > 0 && yo2 > 0) {    
        if (yo1 < yo2) {
            v = yo1;
        } else {
            v = -yo2;
        }
    }
    return v;
  }

  updateLegendPositions() {
    if (!this.haveData) return;

    // adjust positions of all blocks
    var loopTime = Date.now();
    var dt = (loopTime - this.lastUpdate) / 1000;  // in seconds
    if (dt > 1/50) dt = 1/50;
    this.lastUpdate = loopTime;

    this.charts.forEach((c) => {
        var h1 = c.height;

        if (c.y !== undefined) {
            for (const [key, col] of Object.entries(c.columns)) {
                
                if (col.lastY !== undefined) {
                    var err = col.lastY - (col.position + this.legendLabelHeight/2);
                    col.av = err * 10;
                }

                for (const [okey, otherCol] of Object.entries(c.columns)) {
                    if (otherCol != col) {
                        var overlap = this.legendOverlap(col, otherCol, this.legendSpacing);
                        if (Math.abs(overlap) > 0) {
                            if (overlap > 5) overlap = 5;
                            if (overlap < -5) overlap = -5;
                            overlap *= 15;
                            col.av += overlap;
                        }
                    }
                }
            }
        }
    });


    // apply accelerations
    var maxBvs = 0;
    this.charts.forEach((c) => {
        var h1 = c.height;

        if (c.y !== undefined) {
            for (const [key, col] of Object.entries(c.columns)) {
                // accelerate in net direction
                col.velocity += col.av;

                // clamp velocity
                if (col.velocity > 20) col.velocity = 20;

                // apply drag
                col.velocity *= 0.97;

                // correct for fraction of time
                col.velocity *= dt;

                // update position
                col.position += col.velocity;

                // clamp position
                if (col.position < 0) col.position = 0;
                if (col.position > h1 - this.legendLabelHeight) col.position = h1 - this.legendLabelHeight; 

                // trigger redraw if movement is significant
                var bvs = col.velocity;
                if (bvs > maxBvs) maxBvs = bvs;
            }
        }
    });

    if (maxBvs > 0.1) this.needsRedraw = true;
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
    var sx1 = x1 + (cw * (this.selectedStartTime - this.startTime)) / timeOuterRange;
    var sx2 = x1 + (cw * (this.selectedEndTime - this.startTime)) / timeOuterRange;
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
    this.ctx.fillRect(sx1-this.chartSpacing, 0, this.chartSpacing, th1);
    this.ctx.fillStyle = this.autoTrack ? '#007bff' : "#888";
    this.ctx.fillRect(sx2, 0, this.chartSpacing, th1);

    // label Y Axis
    this.ctx.fillStyle = "#888";
    this.ctx.font = this.font;
    var ty = y1 + this.timeHeight - 5;

    // start
    this.ctx.textAlign = "right";
    this.ctx.fillText(format(this.startTime, "HH:mm:ss"), x1-this.chartSpacing-2, 10);
    // end
    this.ctx.textAlign = "left";
    this.ctx.fillText(format(this.endTime, "HH:mm:ss"), x1 + cw + this.chartSpacing + 2, 10);

    this.ctx.textAlign = "right";
    // selection start
    this.ctx.fillText(format(this.selectedStartTime, "HH:mm:ss"), x1-2, ty);
    // selection end
    this.ctx.textAlign = "left";
    this.ctx.fillText(
      format(this.selectedEndTime, "HH:mm:ss"),
      w - this.legendWidth+2,
      ty
    );

    // draw start handle

    // draw charts
    // ------------------------------------------------------------
    y1 = this.timeHeight;

    this.charts.forEach((c) => {
      c.y = y1;
      var h1 = c.height - this.axesHeight; // chart area`

      // background
      this.ctx.fillStyle = "#141a20";
      this.ctx.fillRect(0, y1, w - this.legendWidth, h1 + this.axesHeight);

      // draw separator (at bottom)
      this.ctx.fillStyle = (c == this.dragSeperator || c == this.hoverSeperator) ? '#aaa' : "#242a30";
      this.ctx.fillRect(0, y1 + c.height, w, this.chartSpacing);

      // calc axes
      var maxV = 0;
      var minV = 0;
      for (const [key, col] of Object.entries(c.columns)) {
        var pd = this.paramData[key];
        maxV = Math.max(maxV, pd.maxValue);
        minV = Math.min(minV, pd.minValue);
      }
      maxV = Math.ceil(maxV);
      minV = Math.floor(minV);

      // scalars
      var vRange = maxV - minV;
      if (vRange == 0) vRange = 1;

      // draw Y axis
      this.ctx.strokeStyle = "#888";
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x1, y1 + h1);
      this.ctx.stroke();

      // draw zero
      this.ctx.strokeStyle = "#666";
      this.ctx.beginPath();
      // X
      var y2 = y1 + h1 - (h1 * (0 - minV)) / vRange;
      this.ctx.moveTo(x1, y2);
      this.ctx.lineTo(x1 + cw, y2);
      this.ctx.stroke();

      // label Y Axis
      this.ctx.fillStyle = "#888";
      this.ctx.font = this.font;
      this.ctx.textAlign = "right";
      this.ctx.fillText(maxV.toFixed(0), x1 - 2, y1 + 10);
      this.ctx.fillText(minV.toFixed(0), x1 - 2, y1 + h1);

      // set clip region 
      this.ctx.save();

      this.ctx.beginPath();
      this.ctx.rect(x1, y1, w-this.legendWidth-x1, h1+this.axesHeight);
      this.ctx.clip();

      // draw data!
      for (const [key, col] of Object.entries(c.columns)) {
        var pd = this.paramData[col.addr];

        this.ctx.strokeStyle = col.style;
        this.ctx.beginPath();

        // find range to draw
        var i = 0;
        var startIndex = 0;
        var endIndex = pd.data.length-1;
        
        pd.data.forEach((pde, pi) => {
            if (pde.t < this.selectedStartTime) startIndex = pi;

            if ( pde.t <= this.selectedEndTime) endIndex = pi+1;
        });
        if (endIndex > pd.data.length-1) endIndex = pd.data.length-1;

        if (pd.data.length > 0) {
            var lpy = 0;
            var lpx = 0;
            var lt = 0;
            for (var i= startIndex; i<endIndex+1; i++) {
                var pde = pd.data[i];
                var px = x1 + (cw * (pde.t - this.selectedStartTime)) / timeRange;
                col.lastY = h1 - (h1 * (pde.v - minV)) / vRange;
                var py = y1 + col.lastY; // invert y drawing

                var td = pde.t - lt;
    
                if (i == startIndex) {
                  this.ctx.moveTo(px, py);
                } else {
                  if (td > 1000*10) this.ctx.lineTo(px,lpy);
                  this.ctx.lineTo(px, py);
                }
                lpx = px;
                lpy = py;
                lt = pde.t;
            }
            // was the last sample ages ago?
            if (lpx < x1+cw-1 ) this.ctx.lineTo(x1+cw ,lpy);
        }
        

        this.ctx.stroke();
      }

      this.ctx.restore();

      // draw legend
      var y2 = y1 + 12;
      var w3 = 40;
      var x2 = w - this.legendWidth + w3;
      var h2 = this.legendLabelHeight;
      var w2 = this.legendWidth-w3;
      for (const [key, col] of Object.entries(c.columns)) {
        var pd = this.paramData[col.addr];

        var y2 = y1 + col.position;
        
        if (col.lastY !== undefined) {
            // draw arrow thing
            this.ctx.fillStyle = col.style;
            this.ctx.beginPath();
            this.ctx.moveTo(w-this.legendWidth, y1 + col.lastY);
            this.ctx.lineTo(x2,y2);   
            this.ctx.lineTo(x2,y2+h2);   
            this.ctx.fill();    
        }

        // draw label
        this.ctx.fillStyle = col.style;
        this.ctx.fillRect(x2, y2, w2, h2);

        this.ctx.fillStyle = '#000';
        this.ctx.font = "10px normal, " + this.baseFont;
        this.ctx.textAlign = "left";
        this.ctx.fillText(pd.nodeObj.name, x2+5, y2+15);
        this.ctx.font = "12px bold, " + this.baseFont;
        this.ctx.fillText(pd.channelObj.name + '.' + pd.paramObj.name, x2+5, y2+32);
      }

      y1 += c.height + this.chartSpacing;
    });
  }
} // end of class
