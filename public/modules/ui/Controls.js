import loadStylesheet from '../loadStylesheet.js';

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
