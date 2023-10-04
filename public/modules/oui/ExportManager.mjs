/*

Manage a UI for exporting param values as CSV

*/

import { format } from "https://cdn.skypack.dev/date-fns";

export default class ExportManager {
  constructor(uiRoot, state) {
    var me = this;
    this.uiRoot = uiRoot;

    this.state = state;
    this.visible = false;

    this.lastRowTime = Date.now();

    this.columns = [{
      index:0,
      node:0,
      channel:0,
      param:0,
      ui: $('<th>Time</th>')
    }];

    this.last = [];  // column values that were last heard

    this.rows = [];

    this.build();

    // param.value
    state.on("param.value", (data) => {
      //{ node: msg.node, channel:msg.channel, param: msg.param, msgType: msg.msgType, values:Array.from(msg.valueArray()) });

      // see if we have a matching column
      var f = null;
      me.columns.every((c)=>{
        if (c.node == data.node && c.channel == data.channel && c.param == data.param) {
          f = c;
          return false;
        } else 
          return true;
      });

      if (f == null) return;

      // add values to relevant column
      me.last[f.index] = data.values;

      // if enough time has passed... add a row
      var loopTime = Date.now();
      if (loopTime > me.lastRowTime + 1000) {
        console.log('adding row');
        me.addRow();
        me.lastRowTime = loopTime;
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

  addRow() {

    // update time entry
    this.last[0] = Date.now();

    // copy .last to create new row
    var newRow = _.clone(this.last);

    // push to rows
    this.rows.push(newRow);

    // update UI
    var tr = $('<tr></tr>');

    // add column values
    newRow.forEach((v, index)=>{
      var s = '';
      if (index == 0) {
        // format as date time
        s = format(new Date(v), 'HH:mm:ss');
      } else {
        // is it an array?
        if (Array.isArray(v)) {
          v.forEach((vp, i2)=>{
            if (i2 > 0) s += '; ';
            s += _.isNumber(vp) ? vp.toFixed(1) : vp;  
          });
        } else
          s = _.isNumber(v) ? v.toFixed(1) : v;
      }
      var td = $('<td>'+s+'</td>');
      tr.append(td);
    });

    this.ui.tbody.append(tr);
  }

  addColumn(node, channel, param, paramValues) {
    
    // check we don't have this column already
    var f = false;
    this.columns.every((c)=>{
      if (c.node == node.id && c.channel == channel.channel && c.param == param.param) {
        f = true;
        return false;
      }
    });

    if (f) return;

    // get additional info


    // add new column
    var newCol = {
      index: this.columns.length,
      node:node.id,
      channel:channel.channel,
      param:param.param,
      title: node.name + ' &gt;<br>' + channel.name + '.' + param.title,
      ui: null
    };
    this.columns.push(newCol);

    // sync .last
    this.last.push(paramValues);

    // add column to table header
    newCol.ui = $('<th>'+ newCol.title +'</th>');
    this.ui.tableHeader.append(newCol.ui);

    this.addRow();
  }


  build() {
    this.ui = {};
    
    this.ui.rightPanel = $('<div class=""></div>');
    this.uiRoot.append(this.ui.rightPanel);

    var t = $('<table class="table table-sm table-dark"></table>');

    var th = $('<thead></thead>');
    t.append(th);
    this.ui.tableHeader = $('<tr></tr>');
    th.append(this.ui.tableHeader);

    // add time column
    this.ui.tableHeader.append(this.columns[0].ui);

    this.ui.tbody = $('<tbody></tbody>');
    t.append(this.ui.tbody);

    this.ui.rightPanel.append(t);

  }
} // end of class
