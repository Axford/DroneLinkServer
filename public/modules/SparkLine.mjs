

export default class SparkLine {
    constructor(container, options) {
        this.container = container;
        this.options = { 
            depth: 60,
            label: '',
            precision:0
        };
        _.merge(this.options, options);

        this.samples = [];
        this.maxSample = 1;

        this.canvas = $('<canvas style="border-radius:2px;" width=10 height=10 />');
        this.container.append(this.canvas);
    }


    addSample(v) {
        this.samples.push(v);
        if (this.samples.length > this.options.depth) this.samples.shift();

        // update max
        this.maxSample = 0;
        this.samples.forEach((s)=>{
            if (s > this.maxSample) this.maxSample = s;
        });

        this.draw();
    }



    draw() {
        var c = this.canvas[0];
        var ctx = c.getContext("2d");

        // keep width updated
        var w = this.container.width();
        ctx.canvas.width = w;
        var h = this.container.height();
        ctx.canvas.height = h;

        ctx.fillStyle = "#343a40";
        ctx.fillRect(0, 0, w, h);

        // draw samples
        ctx.strokeStyle = "#8f8";
        ctx.beginPath();
        for (var i=0; i<this.samples.length; i++) {
            var x1 = i * (w-20) / (this.samples.length-1);
            var v = h * this.samples[i] / this.maxSample;
            if (i==0) {
                ctx.moveTo(0,h-v);
            } else {
                ctx.lineTo(x1,h-v);
            }
        }
        ctx.stroke();

        // fade out right edge contrast
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(w-20, 0, 20, h);

        // draw label top-right
        ctx.fillStyle = '#fff';
        ctx.font = '12px serif bold';
        ctx.textAlign = 'right';
        ctx.fillText(this.options.label, w-2,11);

        // draw latest value bottom-right
        ctx.fillStyle = '#8f8';
        ctx.font = '12px serif';
        ctx.fillText(this.samples[this.samples.length-1].toFixed(this.options.precision), w-2, h);
    }


}