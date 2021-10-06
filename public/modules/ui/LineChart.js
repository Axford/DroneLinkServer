import loadStylesheet from '../loadStylesheet.js';
import { colorArray, paleColorArray } from '../colors.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/ui/LineChart.css');

export default class LineChart extends React.Component {
  constructor(props) {
    super(props);
    this.chartRef = React.createRef();
  }

  componentDidUpdate() {
    this.myChart.data.labels = this.props.data[0].map(d => d._time);
    for (var i=0; i<this.props.data.length; i++) {
      this.myChart.data.datasets[i].data = this.props.data[i].map(d => d._value);
    }
    this.myChart.update();
  }

  componentDidMount() {
    var options = {
      type: 'line',
      options: {
				animation:false,
        responsive: true,
        maintainAspectRatio: false,
        legend: {
          display: false
        },
        elements: {
          line: {
            borderColor: '#b0d0f0',
            borderWidth: 2
          },
          point: {
            radius: 0
          }
        },
        layout: {
          padding: 2
        },
        tooltips: {
          enabled: false
        },
        scales: {
          yAxes: [
            {
              display: true,
              position: 'right',
              gridLines: {
                display: false
              },
            }
          ],
          xAxes: [
            {
              display: false
            }
          ]
        }
      },
      data: {
        labels: this.props.data[0].map(d => d.time),
        datasets: []
      }
    }

    // populate datasets
    for (var i=0; i<this.props.data.length; i++) {
      options.data.datasets.push({
        label: this.props.title,
        data: this.props.data[i].map(d => d.value),
        fill:false,
        borderColor: paleColorArray[i],
        lineTension: 0
      });
    }

    this.myChart = new Chart(this.chartRef.current, options);
  }

  render() {
    return e('canvas', { ref: this.chartRef, className:'LineChart', color:'#eee' });
  }
}
