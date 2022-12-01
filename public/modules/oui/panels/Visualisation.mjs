import Panel from './Panel.mjs';
import loadStylesheet from '../../loadStylesheet.js';

loadStylesheet('./css/modules/oui/panels/Visualisation.css');



function radiansToDegrees(a) {
    return a * 180 / Math.PI;
  }
  
  function degreesToRadians(a) {
    return a * Math.PI / 180;
  }
  

  function calculateDistanceBetweenCoordinates(lon1, lat1, lon2, lat2) {
    const R = 6371e3; // metres
    var lat1r = lat1 * Math.PI/180; // φ, λ in radians
    var lat2r = lat2 * Math.PI/180;
    var lon1r = lon1 * Math.PI/180; // φ, λ in radians
    var lon2r = lon2 * Math.PI/180;
  
    var x = (lon2r-lon1r) * Math.cos((lat1r+lat2r)/2);
    var y = (lat2r-lat1r);
    var d = Math.sqrt(x*x + y*y) * R;
  
    return d;
  }
  
  function drawLabelledHand(ctx, ang, label, r1, r2, color) {
    var angR = (ang - 90) * Math.PI / 180;
  
    var cx = ctx.canvas.width / 2;
    var cy = ctx.canvas.height / 2;
  
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx + r1*Math.cos(angR), cy + r1*Math.sin(angR));
    ctx.lineTo(cx + r2*Math.cos(angR), cy + r2*Math.sin(angR) );
    ctx.stroke();

    if (label > '') {
        ctx.fillStyle = color;
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';

        var x1 = cx  + r2*Math.cos(angR);
        var y1 = cy + r2*Math.sin(angR);
    
        ctx.beginPath();
        ctx.arc(x1, y1, 25, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#000';
        //ctx.fillText(ang.toFixed(0) + '°', 10, 25);
        ctx.fillText(label, x1, y1 + 4);
    }
  }
  
function drawLabel(ctx, v, label, x, y, color) {
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.font = '12px serif';
    ctx.fillText(label, x, y+12);
    ctx.fillStyle = color;
    ctx.font = '24px bold serif';
    ctx.fillText(v, x, y+35);
}

function drawPill(ctx, label, x, y, w, color) {
    ctx.fillStyle = color;
    // draw pill
    var r = 8;
    var x1 = x - w/2 + r;
    var x2 = x + w/2 - r;

    ctx.beginPath();
    ctx.arc(x1, y+r, r, 0, 2 * Math.PI);
    ctx.fill();

    ctx.beginPath();
    ctx.fillRect(x1,y, w - 2*r, 2*r);

    ctx.beginPath();
    ctx.arc(x2, y + r, r, 0, 2 * Math.PI);
    ctx.fill();

    // draw label
    ctx.textAlign = 'center';
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x, y+12);
}


function drawTickedCircle(ctx, cx, cy, r, color) {
    // outer circle
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 140, 0, 2 * Math.PI);
    ctx.stroke();

    // outer ticks
    ctx.beginPath();
    for (var i =0; i<12; i++) {
    var ang = (i*30) * Math.PI / 180;
    ctx.moveTo(cx + r*Math.cos(ang), cy + r*Math.sin(ang));
    ctx.lineTo(cx + (r+10)*Math.cos(ang), cy + (r+10)*Math.sin(ang) );
    }
    ctx.stroke();
}

var boatHullVector = [
    [-1,0],
    [-0.8,0.6],
    [0,1],
    [0.8,0.6],
    [1,0],
    [0.7,-0.9],
    [0,-1],
    [-0.7,-0.9],
    [-1,0]
];

var wingVector = [
    [-1,0],
    [-0.7,0.2],
    [0,0.3],
    [0.7,0.2],
    [1,0],
    [0,-1],
    [-1,0]
];

function drawVector(ctx, v, x, y, r, scaleX, scaleY, color, doFill) {
    if (v.length < 2) return;

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();

    var ang = degreesToRadians(r - 180);

    for(var i=0; i<v.length; i++) {
        var xa = v[i][0] * scaleX;
        var ya = v[i][1] * scaleY;
        var x1 = x + xa*Math.cos(ang) - ya*Math.sin(ang);
        var y1 = y + xa*Math.sin(ang) + ya*Math.cos(ang);

        if (i==0) {
            ctx.moveTo(x1,y1);
        } else {
            ctx.lineTo(x1,y1);
        }
    }
    
    if (doFill) {
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
    } else {
        ctx.stroke();
    }
}


export default class Visualisation extends Panel {

  constructor(node, tabs, panels) {
    super(node, tabs, panels);

    this.tabName = 'Visualisation';
    this.title = 'Visualisation';
    this.icon = 'fas fa-eye';

    this.visScript = '';

    this.build();
  }


  build() {
    super.build();

    // error overlay
    this.ui.error = $('<div class="errorOverlay" />');
    this.ui.panel.append(this.ui.error);

    // canvas for vis
    this.ui.canvas = $('<canvas height=400 />');
    this.ui.panel.append(this.ui.canvas);

    // script editor block
    this.cuiEditorBlock = $('<div class="editorBlock" ></div>');
    this.ui.panel.append(this.cuiEditorBlock);

    // nav
    this.cuiEditorNav = $('<div class="editorNav clearfix"></div>');
    this.cuiEditorBlock.append(this.cuiEditorNav);

    this.cuiEditorShowBut = $('<button class="btn btn-sm btn-secondary mr-1">Show</button>');
    this.cuiEditorShowBut.on('click',()=>{
        this.aceEditor.session.setValue(this.visScript,-1);
    });
    this.cuiEditorNav.append(this.cuiEditorShowBut);

    this.cuiEditorUpdateBut = $('<button class="btn btn-sm btn-secondary mr-2">Update</button>');
    this.cuiEditorUpdateBut.on('click',()=>{
        this.visScript = this.aceEditor.session.getValue();
    });
    this.cuiEditorNav.append(this.cuiEditorUpdateBut);

    this.cuiEditorSaveBut = $('<button class="btn btn-sm btn-primary">Save</button>');
    this.cuiEditorSaveBut.on('click',()=>{
      var contents = this.aceEditor.session.getValue();
      // save to firebase
      this.node.updateVisualisation(this.visScript);
    });
    this.cuiEditorNav.append(this.cuiEditorSaveBut);

    this.cuiEditorTitle = $('<div class="title"></div>');
    this.cuiEditorNav.append(this.cuiEditorTitle);

    // editor
    this.cuiEditor = $('<div class="editor"></div>');

    this.aceEditor = ace.edit(this.cuiEditor[0], {
        mode: "ace/mode/javascript",
        theme:'ace/theme/dracula',
        selectionStyle: "text"
    });
    this.aceEditor.on('change', ()=>{
      
    });
    this.cuiEditorBlock.append(this.cuiEditor);


    setInterval(()=>{
        this.update();
    }, 1000);
  }

  update() {
    if (!this.node.focused || !this.visible) return;

    var now = (new Date()).getTime();

    var c = this.ui.canvas[0];
    var ctx = c.getContext("2d");

    // keep width updated
    var w = this.ui.panel.width();
    ctx.canvas.width = w;
    var h = 400;
    ctx.canvas.height = h;
    var cx = w/2;
    var cy = h/2;

    ctx.fillStyle = '#040a20';
    ctx.fillRect(0,0,w,h);

    var state = this.node.state;


    // check for visualisation script
    if (this.visScript == '') {
        if (this.node.state.state[this.node.id] && 
            this.node.state.state[this.node.id].visualisation) {
            var vis = this.node.state.state[this.node.id].visualisation;
            if (vis > '') {
                // assign new script
                this.visScript = vis;
            }
        }
    }
    
    if (this.visScript > '') {
        console.log('Custom Vis:');
        try {
            eval(this.visScript);

            this.ui.error.hide();
        } catch(e) {
            console.error(e);

            this.ui.error.html('<b>' + e.message + '</b><br><br><pre>' + e.stack + '</pre>');
            this.ui.error.show();
        }
    
    }


  }

  resize() {
    this.update();
  }

}
