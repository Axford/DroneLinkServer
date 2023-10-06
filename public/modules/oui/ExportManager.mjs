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
      title:'Time',
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

  reset() {
    this.clear();

    // remove columns
    this.columns = this.columns.slice(0,1);

    // remove table headings elements
    this.ui.tableHeader.children('th').remove('.dataColumn');

    // clear last
    this.last = this.last.slice(0,1);
  }

  clear() {
    // remove rows
    this.rows = [];
    this.ui.tbody.empty();
  }

  export() {
    var s = '';

    // add column headings
    this.columns.forEach((c, index)=>{
      if (index > 0) s += ',';
      s += '"' + c.title + '"';
    });
    s += '\n';

    // add rows
    this.rows.forEach((r, index)=>{
      if (index > 0) s += '\n';
      
      // for each value
      r.forEach((v, i2)=>{
        var vs = i2 > 0 ? ',' : '';
        if (i2 == 0) {
          // format as date time
          vs = format(new Date(v), 'dd/mm/yyyy HH:mm:ss');
        } else {
          // is it an array?
          if (Array.isArray(v)) {
            v.forEach((vp, i3)=>{
              if (i3 > 0) vs += ';';
              vs += _.isNumber(vp) ? vp.toFixed(1) : vp;  
            });
          } else
            vs = _.isNumber(v) ? v.toFixed(1) : v;
        }
        s += vs;
      });
    });

    var src = URL.createObjectURL(new Blob([s], {type: "text/csv" }));

    // also set it on a link for easy downloading
    this.ui.downloadLink.attr('href', src);
    this.ui.downloadLink.attr('download', 'export.csv');
    this.ui.downloadLink.attr('target', '_blank');
    this.ui.downloadLink[0].click();

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

    // add new column
    var title = '';
    title += (node.name != '') ? node.name : node.id;
    title += ' &gt;<br>';
    title += (channel.name != '?') ? channel.name : channel.channel;
    title += '.';
    title += (param.title != '?') ? param.title : param.param;

    var newCol = {
      index: this.columns.length,
      node:node.id,
      channel:channel.channel,
      param:param.param,
      title: title,
      ui: null
    };
    this.columns.push(newCol);

    // sync .last
    this.last.push(paramValues);

    // add column to table header
    newCol.ui = $('<th class="dataColumn">'+ newCol.title +'</th>');
    this.ui.tableHeader.append(newCol.ui);

    this.addRow();
  }


  build() {
    var me = this;
    this.ui = {};
    
    // Nav
    // -----------------------------------------------------------------------
    var topNav = $('<div class="mb-3"></div>');
    this.uiRoot.append(topNav);

    this.ui.exportButton = $('<button class="btn btn-success mr-5">Export CSV</button>');
    this.ui.exportButton.on('click', ()=>{
      me.export();
    });
    topNav.append(this.ui.exportButton);

    this.ui.clearButton = $('<button class="btn btn-warning mr-3">Clear</button>');
    this.ui.clearButton.on('click', ()=>{
      me.clear();
    });
    topNav.append(this.ui.clearButton);

    this.ui.resetButton = $('<button class="btn btn-danger">Reset</button>');
    this.ui.resetButton.on('click', ()=>{
      me.reset();
    });
    topNav.append(this.ui.resetButton);


    // hidden download link
    this.ui.downloadLink = $('<a class="hidden"></a>');
    this.uiRoot.append(this.ui.downloadLink);


    // Table
    // -----------------------------------------------------------------------
    var t = $('<table class="table table-sm table-dark"></table>');

    var th = $('<thead></thead>');
    t.append(th);
    this.ui.tableHeader = $('<tr></tr>');
    th.append(this.ui.tableHeader);

    // add time column
    this.ui.tableHeader.append(this.columns[0].ui);

    this.ui.tbody = $('<tbody></tbody>');
    t.append(this.ui.tbody);

    this.uiRoot.append(t);

  }
} // end of class
