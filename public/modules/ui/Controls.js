import loadStylesheet from '../loadStylesheet.js';
import { getObjectsForAddress } from '../droneLinkUtils.js';

// shortcut
const e = React.createElement;

loadStylesheet('./css/modules/ui/Controls.css');

export class HexControl extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {

    return e(
      'span',
      { key: 'hex', className: 'value'},
      this.props.value.toString(16)
    );
  }
}


export class NumberControl extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {

    return e(
      'span',
      { key: 'num', className: 'value'},
      this.props.value.toLocaleString()
    );
  }
}


export class StringControl extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {

    return e(
      'span',
      { key: 'string', className: 'value'},
      this.props.value
    );
  }
}


export class FloatControl extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {

    return e(
      'span',
      { key: 'float', className: 'value', style: {color: this.props.color} },
      this.props.value ? this.props.value.toFixed(3) : 0
    );
  }
}


export class AddrControl extends React.Component {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    console.log(this.props.addr, this.props.values);
    var obj = getObjectsForAddress(this.props.cs, this.props.values);
    console.log('addr',this.props.values, obj);
  }

  render() {
    var obj = getObjectsForAddress(this.props.cs, this.props.values);


    var addrString = '?';
    if (obj && obj.channel.name != undefined) {
      addrString = (this.props.values[1] + '> ' + obj.channel.name + ' .' + obj.param.name);
    } else if (this.props.values.length == 4) {
      addrString = (this.props.values[1] + '>' + this.props.values[2] + '.' + this.props.values[3]);
    }

    return e(
      'span',
      { key: 'num', className: 'value valueAddr'},
      addrString
    );
  }
}
