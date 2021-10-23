import loadStylesheet from '../loadStylesheet.js';
import { getParamValueFromChannel, getParamObjFromChannel } from '../droneLinkUtils.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/interfaces/NMEA.css');


export default class NMEA extends React.Component {
	constructor(props) {
		super(props);
		this.mapRef = React.createRef();
		this.overlayRef = React.createRef();
		this.data = { "type": "LineString", "coordinates": [] };
		this.boatMarker;
	}

	componentDidUpdate() {
		this.map.jumpTo({ 'center': getParamValueFromChannel(this.props.channelObj, 8, [0,0,0]) } );

		this.boatMarker
			.setLngLat(getParamValueFromChannel(this.props.channelObj, 8, [0,0,0]));

		var satellites = getParamValueFromChannel(this.props.channelObj, 9, [0])[0];
		var HDOP = getParamValueFromChannel(this.props.channelObj, 12, [0])[0];
		this.overlayRef.current.innerHTML = 'Sat: ' + satellites.toFixed(0) + '<br/>hDOP: '+HDOP.toFixed(0);


		// update trace from sparkLine
		/*
		try {
			var p = getParamObjFromChannel(this.props.channelObj, 8);
			if (p.sparkLine && p.sparkLine.length>1) {
				this.data.coordinates = [];
				p.sparkLine[0].forEach((e,i)=>{
					this.data.coordinates.push([e._value, p.sparkLine[1][i]._value]);
				});

				var src = this.map.getSource('trace');
				if (src) src.setData(this.data);
			}
		} catch(err) {
			console.error(err.message);
		}
		*/

	}

	componentDidMount() {
		this.map = new mapboxgl.Map({
			container: this.mapRef.current,
			style: 'mapbox://styles/mapbox/satellite-v9',
			center: [-1.8, 52],
			zoom: this.props.zoom
		});

		// create boat marker
    const el = document.createElement('div');
    el.className = 'boatMarker';

		this.boatMarker = new mapboxgl.Marker(el)
      .setLngLat(getParamValueFromChannel(this.props.channelObj, 8, [0,0,0]))
      .addTo(this.map);

		this.map.on('load', async () => {
			this.map.addSource('trace', { type: 'geojson', data: this.data });
			this.map.addLayer({
				'id': 'trace',
				'type': 'line',
				'source': 'trace',
				'paint': {
					'line-color': '#00ff00',
					'line-opacity': 0.5,
					'line-width': 3
				}
			});
		});

	}

	render() {
		return e('div', { className:'NMEAContainer' },
      e('div', { key: 'NMEAOverlay', ref: this.overlayRef, className:'NMEAOverlay'} ),
      e('div', { key:'NMEAMap', ref: this.mapRef, className:'NMEA' })
    );
  }
}
