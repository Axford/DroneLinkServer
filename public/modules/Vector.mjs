/*

Simple 2D JavaScript Vector Class

Hacked from evanw's lightgl.js
https://github.com/evanw/lightgl.js/blob/master/src/vector.js

*/

export default class Vector {
  constructor(x, y) {
  	this.x = x || 0;
  	this.y = y || 0;
  }

	negative() {
		this.x = -this.x;
		this.y = -this.y;
		return this;
	}
	add(v) {
		if (v instanceof Vector) {
			this.x += v.x;
			this.y += v.y;
		} else {
			this.x += v;
			this.y += v;
		}
		return this;
	}
	subtract(v) {
		if (v instanceof Vector) {
			this.x -= v.x;
			this.y -= v.y;
		} else {
			this.x -= v;
			this.y -= v;
		}
		return this;
	}
	multiply(v) {
		if (v instanceof Vector) {
			this.x *= v.x;
			this.y *= v.y;
		} else {
			this.x *= v;
			this.y *= v;
		}
		return this;
	}
	divide(v) {
		if (v instanceof Vector) {
			if(v.x != 0) this.x /= v.x;
			if(v.y != 0) this.y /= v.y;
		} else {
			if(v != 0) {
				this.x /= v;
				this.y /= v;
			}
		}
		return this;
	}
  reciprocal(v) {
    if (v instanceof Vector) {
			if(this.x != 0) v.x /= this.x;
			if(this.y != 0) v.y /= this.y;
		} else {
			if(this.x != 0) this.x = v / this.x;
      if(this.y != 0) this.y = v/ this.y;
		}
		return this;
  }
	equals(v) {
		return this.x == v.x && this.y == v.y;
	}
	dot(v) {
		return this.x * v.x + this.y * v.y;
	}
	cross(v) {
		return this.x * v.y - this.y * v.x
	}
	length() {
		return Math.sqrt(this.dot(this));
	}
	normalize() {
		return this.divide(this.length());
	}
	capLength(len) {
		var curLen = this.length();
		if (curLen > len) {
			this.multiply(len / curLen);
		}
	}
	min() {
		return Math.min(this.x, this.y);
	}
	max() {
		return Math.max(this.x, this.y);
	}
  fromAngle(ang,len) {
    this.x = len * Math.cos(ang);
    this.y = len * Math.sin(ang);
  }
	toAngles() {
		return -Math.atan2(-this.y, this.x);
	}
	angleTo(a) {
		return Math.acos(this.dot(a) / (this.length() * a.length()));
	}
	toArray(n) {
		return [this.x, this.y].slice(0, n || 2);
	}
  rotate(a) {
    var x = this.x;
    var y = this.y;
    var cs = Math.cos(a);
    var sn = Math.sin(a);
    this.x = x * cs - y * sn;
    this.y = x * sn + y * cs;
    return this;
  }
	clone() {
		return new Vector(this.x, this.y);
	}
  set(v) {
    this.x = v.x;
    this.y = v.y;
    return this;
  }
}

/* INSTANCE METHODS */



/*
// STATIC METHODS
Vector.negative = function(v) {
	return new Vector(-v.x, -v.y);
};
Vector.add = function(a, b) {
	if (b instanceof Vector) return new Vector(a.x + b.x, a.y + b.y);
	else return new Vector(a.x + b, a.y + b);
};
Vector.subtract = function(a, b) {
	if (b instanceof Vector) return new Vector(a.x - b.x, a.y - b.y);
	else return new Vector(a.x - b, a.y - b);
};
Vector.multiply = function(a, b) {
	if (b instanceof Vector) return new Vector(a.x * b.x, a.y * b.y);
	else return new Vector(a.x * b, a.y * b);
};
Vector.divide = function(a, b) {
	if (b instanceof Vector) return new Vector(a.x / b.x, a.y / b.y);
	else return new Vector(a.x / b, a.y / b);
};
Vector.equals = function(a, b) {
	return a.x == b.x && a.y == b.y;
};
Vector.dot = function(a, b) {
	return a.x * b.x + a.y * b.y;
};
Vector.cross = function(a, b) {
	return a.x * b.y - a.y * b.x;
};
*/
