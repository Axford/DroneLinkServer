import loadStylesheet from '../loadStylesheet.js';
import * as DLM from '../droneLinkMsg.js';
import { getParamValueFromChannel } from '../droneLinkUtils.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/interfaces/WaypointNav.css');

const metersToPixels = (meters, latitude, zoom) =>
  meters / (78271.484 / 2 ** zoom) / Math.cos(latitude * Math.PI / 180);





export default class WaypointNav extends React.Component {
	constructor(props) {
		super(props);
		this.mapRef = React.createRef();
    this.boatMarker;
		this.markers = [];
		this.markerTrace = { "type": "LineString", "coordinates": [] };
    this.boatTrace = { "type": "LineString", "coordinates": [] };
	}

	componentDidUpdate() {

    var boatLoc = getParamValueFromChannel(this.props.value, 9, [0,0,0]);

		// get active waypoint
		var wp = getParamValueFromChannel(this.props.value, 13, [0])[0];

		// get loopTo
		var loopTo = getParamValueFromChannel(this.props.value, 14, [0])[0];

    this.boatMarker
      .setLngLat(boatLoc);

    // ensure we have all markers displayed
		var paramKeys = Object.keys(this.props.value.params);

		var mid = 0;
		for (var i=0; i < paramKeys.length; i++) {
			if (paramKeys[i] >= 100) {

        var loc = getParamValueFromChannel(this.props.value, paramKeys[i], [0,0,0]);

				if (mid > this.markers.length-1) {
					const el = document.createElement('div');
  				el.className = 'marker ' + (wp == mid ? 'active' : '');
					el.innerHTML = mid+1;

					var newMarker = new mapboxgl.Marker(el)
						.setLngLat(loc)
						.addTo(this.map)
						.setDraggable(true);

					newMarker.wp = mid;
					newMarker.values = loc;
					newMarker.addr = this.props.node + '>' + this.props.channel + '.' + paramKeys[i];
					newMarker.wpRadius = loc[2];
					newMarker.dragging = false;

					var pixelRadius = metersToPixels(newMarker.wpRadius, loc[1], this.map.getZoom() )
					el.style.width = pixelRadius + 'px';
					el.style.height = pixelRadius + 'px';
					el.style.lineHeight = pixelRadius + 'px';

					newMarker.on('dragstart', (e)=>{
						e.target.dragging = true;
					});

					newMarker.on('dragend', (e)=>{
							// e.target
							const lngLat = e.target.getLngLat();

							// clear radius to indicate an update is in progress
							e.target.values[2] = 0;
							e.target.getElement().classList.add('updating');

							console.log('Moved WP: '+e.target.wp, lngLat);

							DLM.sendDroneLinkMsg({
								addr: e.target.addr,
								msgType: DLM.DRONE_LINK_MSG_TYPE_FLOAT,
								values: [ lngLat.lng, lngLat.lat , e.target.wpRadius]
							});

							e.target.dragging = false;

						})

					this.markers.push(newMarker);

					this.markerTrace.coordinates.push( loc );
				} else {
					// update markers
					//console.log(this.markers[mid])
					if (!this.markers[mid].dragging) {
						this.markers[mid].wpRadius = loc[2];
						const el = this.markers[mid].getElement();
						var pixelRadius = metersToPixels(this.markers[mid].wpRadius, loc[1], this.map.getZoom() )
						el.style.width = pixelRadius + 'px';
						el.style.height = pixelRadius + 'px';
						el.style.lineHeight = pixelRadius + 'px';


						if (wp == mid) {
							el.classList.add('active');
						} else {
							el.classList.remove('active');
						}
						if (loc[2] > 0) {
							el.classList.remove('updating');
							this.markers[mid].setLngLat(loc);
							this.markerTrace.coordinates[mid] = loc;
						}
					}


				}
				mid++;
			}
		}

		// update marker trace
		var src = this.map.getSource('markerTrace');
		if (src) src.setData(this.markerTrace);

    // update boat trace from sparkLine

		try {
			if (this.props.value.sparkLine && this.props.value.sparkLine.length>1) {
				this.boatTrace.coordinates = [];
				this.props.value.sparkLine[0].forEach((e,i)=>{
					this.boatTrace.coordinates.push([e._value, this.props.value.sparkLine[1][i]._value]);
				});

				var src = this.map.getSource('boatTrace');
				if (src) src.setData(this.boatTrace);
			}
		} catch(err) {
			console.error(err.message);
		}

	}

	componentDidMount() {
		this.map = new mapboxgl.Map({
			container: this.mapRef.current,
			style: 'mapbox://styles/mapbox/satellite-v9',
			center: getParamValueFromChannel(this.props.value, 9, [0,0,0]),
			zoom: 12
		});

    // create boat marker
    const el = document.createElement('div');
    el.className = 'boatMarker';

    this.boatMarker = new mapboxgl.Marker(el)
      .setLngLat(getParamValueFromChannel(this.props.value, 9, [0,0,0]))
      .addTo(this.map);

		this.map.on('load', async () => {
			this.map.addSource('markerTrace', { type: 'geojson', data: this.markerTrace });
			this.map.addLayer({
				'id': 'markerTrace',
				'type': 'line',
				'source': 'markerTrace',
				'paint': {
					'line-color': 'yellow',
					'line-opacity': 0.5,
					'line-width': 2
				}
			});

      this.map.addSource('boatTrace', { type: 'geojson', data: this.boatTrace });
			this.map.addLayer({
				'id': 'boatTrace',
				'type': 'line',
				'source': 'boatTrace',
				'paint': {
					'line-color': '#0f0',
					'line-opacity': 0.5,
					'line-width': 3
				}
			});
		});

	}

	render() {
    return e('div', { ref: this.mapRef, className:'WaypointNav' });
  }
}
