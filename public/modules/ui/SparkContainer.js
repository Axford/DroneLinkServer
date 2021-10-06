import loadStylesheet from '../loadStylesheet.js';
import LineChart from './LineChart.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/ui/SparkContainer.css');


export default class SparkContainer extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    return e('div', {className:'SparkContainer' }, e(LineChart, { data: this.props.sparkLine }));
  }
}
