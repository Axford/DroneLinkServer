
export default class DroneLinkMeshMsgSequencer {

  constructor() {
    this.bitmask = Array(32);
    this.clear();
  }


  clear() {
    for (var i=0; i<32; i++) {
      this.bitmask[i] = 0;
    }
  }


  isDuplicate(v) {

    // calc byte index
    var index = v >> 3;  // divide by 8
    var bm = 1 << (v & 0b111);  // mask for this bit in associated byte ... lower 3 bits

    // clear opposite semi-circle...  circle is 32 bytes round, so opposite half starts at +8 from current index
    var p = index + 8;
    if (p > 31) p -= 32;
    for (var i = 0; i<16; i++) {
      this.bitmask[p] = 0;
      p++;
      if (p > 31) p =0;
    }

    // check bit for v
    if ((this.bitmask[index] & bm) > 0) {
      // already set
      return true;
    }

    // set bit for v
    this.bitmask[index] |= bm;

    return false;
  }

}
