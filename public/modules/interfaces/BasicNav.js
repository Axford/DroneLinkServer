import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.js';


// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/interfaces/BasicNav.css');

export default class BasicNav extends React.Component {
	constructor(props) {
		super(props);
		this.mapRef = React.createRef();
	}

	componentDidUpdate() {
		//this.map.jumpTo({ 'center': [-2,52], 'zoom': this.props.zoom });

	}

	componentDidMount() {
		this.map = new mapboxgl.Map({
			container: this.mapRef.current,
			style: 'mapbox://styles/mapbox/satellite-v9',
			center: [-1.8297, 51.5618],
			zoom: this.props.zoom
		});

		this.map.on('moveend', () => {
			var lon = this.map.getCenter().lng.toFixed(4);
			var lat = this.map.getCenter().lat.toFixed(4);
			console.log(lon,lat);
			DLM.sendDroneLinkMsg({
				addr: this.props.addr,
				msgType: DLM.DRONE_LINK_MSG_TYPE_FLOAT,
				values: [ lon, lat ]
			});
		});
	}

	render() {
    return e('div', { ref: this.mapRef, className:'BasicNav' });
  }
}
