
import loadStylesheet from '../loadStylesheet.js';
import { colorArray, paleColorArray } from '../colors.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/ui/ScatterChart.css');



export default class ScatterChart extends React.Component {
  constructor(props) {
    super(props);
    this.chartRef = React.createRef();
  }

  componentDidUpdate() {
		// will only plot the first two datasets
		var comp = this;

		var data = comp.props.data.sparkLine[0].map(function(e, i) {
			 return { x: e._value, y: comp.props.data.sparkLine[1][i]._value }
		});
    comp.myChart.data.datasets[0].data = data;

		//console.log(data);

    comp.myChart.update();
  }

  componentDidMount() {

		var data = [];

    var options = {
      type: 'scatter',
      options: {
				animation:false,
        responsive: true,
        maintainAspectRatio: false,
        legend: {
          display: false
        },
				showLines: false,
				elements: {
					point: {
						radius: 5
					}
				}
      },
      data: {
        datasets: [{
					data: data
				}]
      }
    }

    this.myChart = new Chart(this.chartRef.current, options);
  }

  render() {
    return e('canvas', { key:'scatter', ref: this.chartRef, className:'ScatterChart', color:'#eee' });
  }
}
