import Vector from "../Vector.mjs";
import loadStylesheet from "../loadStylesheet.js";

loadStylesheet("./css/modules/oui/wiring.css");

// position of pins map

var moboInfo = {
  v2: {
    img: "/images/DroneLinkV2PinOutSimple.jpeg",
    imgWidth: 1237,
    imgHeight: 901,
    pinMap: {
      i0: [985, 783],
      i1: [1079, 783],
      i2: [985, 561],
      i3: [1079, 561],
      i4: [985, 337],
      i5: [1079, 337],
      i6: [985, 116],
      i7: [1079, 116],
      1: [864, 56], // serial 0 Tx
      2: [864, 685],
      3: [864, 97], // serial 0 Rx
      4: [864, 646],
      12: [262, 644], // serial 1 Tx
      13: [262, 685], // serial 1 Rx
      17: [864, 348], // serial 2 Tx
      16: [864, 390], // serial 2 Rx
      14: [262, 380],
      15: [262, 339],
      25: [156, 771],
      26: [156, 731],
      32: [156, 544],
      33: [156, 505],
      34: [156, 318],
      35: [156, 279], // analog
    },
  },
  v4: {
    img: "/images/DroneLinkV4PinOutSimple.png",
    imgWidth: 2434,
    imgHeight: 2096,
    pinMap: {
      i0: [2334, 1844],
      i1: [2334, 1311],
      i2: [2334, 782],
      i3: [2334, 254],
      i4: [1940, 878],
      i5: [1940, 364],
      i6: [1940, 878],
      i7: [1940, 101],
      2: [1800, 1860],
      12: [410, 1720], // serial 1 Tx
      13: [310, 1720], // serial 1 Rx
      17: [410, 1485], // serial 2 Tx
      16: [310, 1485], // serial 2 Rx
      14: [310, 1245],
      15: [410, 1245],
      25: [310, 1005],
      26: [410, 1005],
      32: [314, 762],
      33: [410, 760],
      35: [310, 1980], // analog
    },
  },
};


/**
 * Draws a rounded rectangle using the current state of the canvas.
 * If you omit the last three params, it will draw a rectangle
 * outline with a 5 pixel border radius
 * @param {CanvasRenderingContext2D} ctx
 * @param {Number} x The top left x coordinate
 * @param {Number} y The top left y coordinate
 * @param {Number} width The width of the rectangle
 * @param {Number} height The height of the rectangle
 * @param {Number} [radius = 5] The corner radius; It can also be an object
 *                 to specify different radii for corners
 * @param {Number} [radius.tl = 0] Top left
 * @param {Number} [radius.tr = 0] Top right
 * @param {Number} [radius.br = 0] Bottom right
 * @param {Number} [radius.bl = 0] Bottom left
 * @param {Boolean} [fill = false] Whether to fill the rectangle.
 * @param {Boolean} [stroke = true] Whether to stroke the rectangle.
 */
function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    if (typeof stroke === 'undefined') {
      stroke = true;
    }
    if (typeof radius === 'undefined') {
      radius = 5;
    }
    if (typeof radius === 'number') {
      radius = {tl: radius, tr: radius, br: radius, bl: radius};
    } else {
      var defaultRadius = {tl: 0, tr: 0, br: 0, bl: 0};
      for (var side in defaultRadius) {
        radius[side] = radius[side] || defaultRadius[side];
      }
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
    if (fill) {
      ctx.fill();
    }
    if (stroke) {
      ctx.stroke();
    }
  
  }

/*

ModuleBlock

*/

function constrain(v, minv, maxv) {
  return Math.max(Math.min(v, maxv), minv);
}

class ModuleBlock {
  constructor(mgr, typeName) {
    this.mgr = mgr;
    this.name = name;
    this.typeName = typeName;
    this.pins = [];

    this.hue = 0;
    this.saturation = 0;
    this.lightness = 90;

    this.fillStyle =
      "hsl(" +
      360 * Math.random() +
      "," +
      "100%," +
      (65 + 20 * Math.random()) +
      "%)";

    var c = this.mgr.ui.canvas[0];
    var ctx = c.getContext("2d");
    var w = ctx.canvas.width;
    var h = ctx.canvas.height;

    this.position = new Vector(w * Math.random(), h * Math.random());
    this.velocity = new Vector(0, 0);
    this.width = 150;
    this.height = 30;
    this.av = new Vector(0, 0);
    this.updatePosition(this.position);
  }

  getStyle(alpha) {
    return (
      "hsl(" +
      this.hue +
      "," +
      this.saturation +
      "%," +
      this.lightness +
      "%, " +
      alpha +
      "%)"
    );
  }

  getAlpha() {
    return 100;
  }

  hit(x, y) {
    return x > this.x1 && x < this.x2 && y > this.y1 && y < this.y2;
  }

  collidingWith(ob, padding) {
    var v = new Vector(0, 0);
    // overlap values will be positive if overlapping
    var xo1 = ob.x2 + padding - this.x1;
    var xo2 = this.x2 + padding - ob.x1;
    var yo1 = ob.y2 + padding - this.y1;
    var yo2 = this.y2 + padding - ob.y1;
    if (xo1 > 0 && xo2 > 0 && yo1 > 0 && yo2 > 0) {
      if (Math.min(xo1, xo2) > Math.min(yo1, yo2)) {
        if (yo1 < yo2) {
          v.y = yo1;
        } else {
          v.y = -yo2;
        }
      } else {
        if (xo1 < xo2) {
          v.x = xo1;
        } else {
          v.x = -xo2;
        }
      }
    }
    return v;
  }

  updatePosition(newPos) {
    this.position.set(newPos);
    this.updateCorners();
  }

  updateCorners() {
    // calculate corner points
    this.x1 = this.position.x - this.width / 2;
    this.y1 = this.position.y - this.height / 2;
    this.x2 = this.position.x + this.width / 2;
    this.y2 = this.position.y + this.height / 2;
  }

  addToPosition(v) {
    this.position.add(v);
    this.updateCorners();
  }

  drawTextScaled(v, x1, y1, w, h, clr = "#000", padding = 5) {
    var c = this.mgr.ui.canvas[0];
    var ctx = c.getContext("2d");

    var fs = 20;
    ctx.fillStyle = clr;
    ctx.textAlign = "center";
    ctx.font = fs + "px serif";
    var tm = ctx.measureText(v);
    // also calculate based on height and take the smallest
    var fs2 = (fs * h) / tm.fontBoundingBoxAscent;
    fs = (fs * (w - 2 * padding)) / tm.width;
    fs = Math.min(fs, fs2);

    ctx.font = fs + "px serif";
    ctx.fillText(v, x1 + w / 2, y1 + h - padding);
  }

  draw() {
    if (this.pins.length == 0) return;
    var c = this.mgr.ui.canvas[0];
    var ctx = c.getContext("2d");

    var w = this.width;
    var w2 = w / 2;
    var h = this.height;
    var h2 = h / 2;
    //var px = this.mgr.panPosition.x;
    //var py = this.mgr.panPosition.y;
    var px = 0;
    var py = 0;

    ctx.fillStyle = this.fillStyle;
    roundRect(ctx, this.x1, this.y1, this.width, this.height, 6, this.fillStyle, false);

    this.drawTextScaled(
      this.typeName + ": " + this.name,
      this.x1,
      this.y1,
      this.width,
      this.height - 5,
      '#000',
      8
    );
  }

  drawWires() {
    var c = this.mgr.ui.canvas[0];
    var ctx = c.getContext("2d");

    if (this.pins.length > 0) {
      var cx = this.position.x;
      var cy = this.position.y;

      // draw pin wires
      ctx.strokeStyle = this.fillStyle;
      ctx.lineWidth = 4;
      this.pins.forEach((pin) => {
        var p = this.mgr.getPinLocation(pin);
        if (p) {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      });
    }
  }
}

/*
  Display a motherboard wiring layout
*/
export default class Wiring {
  constructor(node) {
    this.node = node;
    this.visible = false;
    this.built = false;

    this.rawConfig = "";

    this.modules = [];

    this.moboVersion = "";

    this.pinMap = {};

    this.ui = {};

    this.dragStart = new Vector(0, 0);
    this.dragBlock = null;
    this.dragBlockPos = new Vector(0, 0); // starting pos
  }

  build() {
    var me = this;

    // floating panel
    this.ui.panel = $('<div class="wiringPanel"></div>');

    // append to body for absolute positioning
    $(document.body).prepend(this.ui.panel);

    this.ui.panel
      .resizable({
        stop: () => {
          me.update();
        },
      })
      .draggable({ handle: ".wiringTitle" });

    // add a close button
    this.ui.closeBtn = $(
      '<button type="button" class="close" aria-label="Close"><span aria-hidden="true">&times;</span></button>'
    );
    this.ui.closeBtn.on("click", () => {
      me.hide();
    });
    this.ui.panel.append(this.ui.closeBtn);

    // add title area / drag handle
    this.ui.title = $('<div class="wiringTitle">Wiring</div>');
    this.ui.panel.append(this.ui.title);

    // add motherboard version selector to title
    this.ui.moboSelect = $('<select class="form-control mt-2"></div>');
    this.ui.moboSelect.append($('<option value="v2">V2 Motherboard</option>'));
    this.ui.moboSelect.append(
      $('<option value="v4" selected>V4 Motherboard</option>')
    );
    this.ui.moboSelect.on("change", () => {
      me.selectMoboVersion(me.ui.moboSelect.val());
    });
    this.ui.title.append(this.ui.moboSelect);

    // canvas
    this.ui.canvas = $("<canvas width=100 height=100 />");
    this.ui.panel.append(this.ui.canvas);

    // event handlers
    this.ui.canvas.on("mousedown", (e) => {
      var offsetX = $(e.target).offset().left;
      var offsetY = $(e.target).offset().top;
      var w = $(e.target).innerWidth();
      var h = $(e.target).innerHeight();

      this.dragStart.x = e.pageX - offsetX;
      this.dragStart.y = e.pageY - offsetY;

      // check if we're clicking on a block...
      var x1 = this.dragStart.x;
      var y1 = this.dragStart.y;

      this.dragBlock = null;
      //console.log('hit', x1, y1);
      for (var i = 0; i < this.modules.length; i++) {
        var b = this.modules[i];
        //console.log('hit', b);
        if (b.hit(x1, y1)) {
          console.log("hit", b);
          this.dragBlock = b;
          this.dragBlockPos.set(b.position);
          continue;
        }
      }
    });

    this.ui.canvas.on("mousemove", (e) => {
      var offsetX = $(e.target).offset().left;
      var offsetY = $(e.target).offset().top;
      var w = $(e.target).innerWidth();
      var h = $(e.target).innerHeight();

      var dx = e.pageX - offsetX - this.dragStart.x;
      var dy = e.pageY - offsetY - this.dragStart.y;

      if (this.dragBlock) {
        var newPos = this.dragBlockPos.clone();
        newPos.x += dx;
        newPos.y += dy;
        this.dragBlock.updatePosition(newPos);
      } 
    });

    this.ui.canvas.on("mouseup", (e) => {
      this.dragBlock = null;
    });

    // reference image
    this.imageLoaded = false;
    this.ui.image = new Image();
    this.ui.image.onload = () => {
      this.imageLoaded = true;
    };

    me.selectMoboVersion("v4");

    this.built = true;
  }

  selectMoboVersion(ver) {
    this.moboVersion = ver;
    var mi = moboInfo[ver];
    this.ui.image.width = mi.imgWidth;
    this.ui.image.height = mi.imgHeight;
    this.ui.image.src = mi.img;
    this.pinMap = mi.pinMap;
    this.update();
  }

  show() {
    if (!this.built) this.build();
    if (this.visible) return;
    this.visible = true;
    this.ui.panel.show();
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.ui.panel.hide();
  }

  getPinLocation(pin) {
    if (this.pinMap.hasOwnProperty(pin)) {
      return {
        x: this.pinMap[pin][0] * this.scaling + this.x1,
        y: this.pinMap[pin][1] * this.scaling + this.y1,
      };
    } else {
      return null;
    }
  }

  update() {
    this.updatePositions();
    this.draw();

    window.requestAnimationFrame(this.update.bind(this));
  }

  draw() {
    if (!this.visible) return;
    if (!this.built) this.build();

    // check image has loaded
    //if (!this.imageLoaded) return;

    var c = this.ui.canvas[0];
    var ctx = c.getContext("2d");

    // keep size updated
    var w = this.ui.panel.width();
    ctx.canvas.width = w;
    var h = this.ui.panel.height() - 67;
    ctx.canvas.height = h;

    ctx.fillStyle = "#343a40";
    ctx.fillRect(0, 0, w, h);

    // draw image, centred and half the width of the window
    var aspect = this.ui.image.height / this.ui.image.width;
    var w1 = w / 2;
    var h1 = w1 * aspect;
    this.scaling = w1 / this.ui.image.width;

    this.x1 = (w - w1) / 2;
    this.y1 = (h - h1) / 2;

    ctx.drawImage(this.ui.image, this.x1, this.y1, w1, h1);

    // draw pin locations
    for (const pin in this.pinMap) {
      var p = this.getPinLocation(pin);
      if (p) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = "#0f0";
        ctx.fill();
      }
    }

    // draw modules and pin wires
    this.modules.forEach((m) => {
      m.drawWires();
    });

    this.modules.forEach((m) => {
      m.draw();
    });
  }

  parseConfig(config) {
    this.rawConfig = config;

    //console.log(config);

    // clear
    this.modules = [];

    // setup syntax parser
    var module = null;

    // parse rawConfig into lines
    var lines = this.rawConfig.split("\n");

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();

      if (line.length > 0) {
        if (line[0] == "[") {
          // new section
          // check ends with a ]
          if (line[line.length - 1] == "]") {
            // instance a new module
            module = new ModuleBlock(this, line.substring(1, line.length - 1));
            this.modules.push(module);
          } else {
            // error, no closing bracket
          }
        } else {
          // should be a regular name = value, possibly quoted
          // pass to module to deal with
          // will include comments
          //module.parseLine(line);
          if (module) {
            // is this a name = value
            var epos = line.indexOf("=");
            if (epos > 0) {
              var name = line.substring(0, epos).trim();
              var values = line
                .substring(epos + 1, line.length)
                .trim()
                .split(",");
              //console.log(name, values);
              if (name == "pins") {
                values.forEach((v) => {
                  module.pins.push(parseInt(v));
                });
              } else if (name == "bus") {
                values.forEach((v) => {
                  module.pins.push("i" + parseInt(v));
                });
              } else if (name == "port") {
                values.forEach((v) => {
                  var p = parseInt(v);
                  if (p == 1) {
                    module.pins.push(12);
                    module.pins.push(13);
                  } else if (p == 2) {
                    module.pins.push(16);
                    module.pins.push(17);
                  }
                });
              } else if (name == "name") {
                values = line.substring(epos + 1, line.length).trim();
                // remove quotes if they're there
                if (values.startsWith('"'))
                  values = values.substring(1, values.length - 1);
                module.name = values;
              }
            }
          }
        }
      }
    }

    console.log("Config parsed, loaded " + this.modules.length + " modules");

    // reset initial positions
    this.modules.forEach((m) => {
      console.log("Module: " + m.typeName + ", pins: " + m.pins.length);
      if (m.pins.length > 0) {
        var p = this.getPinLocation(m.pins[0]);
        if (p) {
          m.updatePosition(new Vector(p.x, p.y + 5));
        }
      }
    });

    this.update();
  }

  updatePositions() {
    if (!this.visible) return;

    // adjust positions of all modules

    var c = this.ui.canvas[0];
    var ctx = c.getContext("2d");

    var w = ctx.canvas.width;
    var h = ctx.canvas.height;

    var cv = new Vector(w / 2, h / 2);

    var modulespacing = 150;
    var blockYSpacing = 50;

    var padding = 20;

    // reset accel vectors
    for (var i = 0; i < this.modules.length; i++) {
      var b = this.modules[i];
      b.av.x = 0;
      b.av.y = 0;
    }

    // update accelerations
    for (var i = 0; i < this.modules.length; i++) {
      var b = this.modules[i];
      if (b.pins.length == 0) continue;

      // push away from centre of view
      var temp = b.position.clone();
      temp.subtract(cv);
      temp.normalize();
      temp.multiply(0.001);
      b.av.add(temp);

      // check wiring
      b.pins.forEach((pin) => {
        // calc vector from this node to hop

        var p = this.getPinLocation(pin);
        if (p) {
          var hv = new Vector(p.x, p.y);
          hv.subtract(b.position);

          // compare it to the target length based on metric
          var hvl = hv.length();
          var targetLen = 100;
          var hvr = (hvl - targetLen) / 10;

          // update accel vector
          hv.normalize();
          hv.multiply(hvr);
          b.av.add(hv);
        }
      });

      // for each block... calculate vector to all other modules
      for (var j = 0; j < this.modules.length; j++) {
        if (j != i) {
          var ob = this.modules[j];

          if (ob == b || ob.pins.length == 0) continue;

          // see if modules are colliding, allow for padding
          // overlap is a vector in direction of minimum overlap
          var overlap = b.collidingWith(ob, padding);
          if (overlap.length() > 0) {
            overlap.multiply(20);
            b.av.add(overlap);
          } else {
            // otherwise add a gentle repulsion
            var temp = ob.position.clone();
            temp.subtract(b.position);
            temp.normalize();
            temp.multiply(1);
            ob.av.add(temp);

            temp.multiply(-1);
            b.av.add(temp);
          }
        }
      }
    }

    // apply accelerations
    for (var i = 0; i < this.modules.length; i++) {
      var b = this.modules[i];

      // accelerate in net direction
      b.av.multiply(0.01);
      b.velocity.add(b.av);

      // clamp velocity
      var bv = b.velocity.length();
      if (bv > 50) {
        b.velocity.multiply(10 / bv);
      }

      // apply drag
      b.velocity.multiply(0.8);

      // update position
      b.addToPosition(b.velocity);
    }
  }
}
