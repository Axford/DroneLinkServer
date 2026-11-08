// Serial diagnostics are local text, never mesh messages or saved observations.
export default class SerialDiagnosticText {
  constructor(emit) { this.emit=emit; this.reset(); }
  reset() {
    if(this.lineOpen) this.breakLine('connection reset');
    clearTimeout(this.timer);this.timer=null;this.text='';this.textBytes=0;
    this.decoder=new TextDecoder('utf-8');this.expected=null;this.lineOpen=false;
  }
  breakLine(reason) {
    clearTimeout(this.timer);this.timer=null;
    const tail=this.decoder.decode();
    if(tail) this.append(tail);
    if(this.text) this.flush(' [incomplete]');
    this.emit(`[diagnostics ${reason}]`);
    this.decoder=new TextDecoder('utf-8');this.lineOpen=false;
  }
  receive(record) {
    const length=record[0],flags=record[1],sequence=record[2]|(record[3]<<8);
    if((flags&4) || (this.expected!==null && sequence!==this.expected)) this.breakLine('gap/loss');
    this.expected=(sequence+1)&65535;
    if(flags&1) {
      if(this.lineOpen) this.breakLine('new line before prior end');
      this.lineOpen=true;
    } else if(!this.lineOpen) {
      this.emit('[diagnostics incomplete line]');this.lineOpen=true;
    }
    this.append(this.decoder.decode(record.slice(4,4+length),{stream:!(flags&2)}));
    if(flags&2) {
      if(this.text) this.flush();
      this.lineOpen=false;
    } else {
      if(!this.timer) this.timer=setTimeout(()=>{this.timer=null;if(this.text)this.flush(' [continued]');},250);
      this.timer.unref?.();
    }
  }
  append(text) {
    for(const ch of text) {
      if(ch==='\r') continue; // Normalize CRLF even across records.
      if(ch==='\n') {this.flush();continue;}
      // Do not let firmware text control the terminal or blessed markup.
      const code=ch.codePointAt(0);
      const visible=(code<32 && ch!=='\t') || (code>=127 && code<=159) || ch==='{' || ch==='}'
        ? `\\u${code.toString(16).padStart(4,'0')}` : ch;
      const size=new TextEncoder().encode(visible).length;
      if(this.textBytes+size>512) this.flush(' [continued]');
      this.text+=visible;this.textBytes+=size;
    }
  }
  flush(suffix='') {
    clearTimeout(this.timer);this.timer=null;
    this.emit(this.text+suffix);this.text='';this.textBytes=0;
  }
}
