import * as DLM from './droneLinkMsg.mjs';

export function getParamValueFromChannel(channelObj, param, defaultVal) {
  var p = getParamObjFromChannel(channelObj, param);
  if (p && p.values) {
      if (p.values instanceof ArrayBuffer) {
        var valueView = [];
        if (p.values instanceof ArrayBuffer) {
          if (p.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT8_T ||
              p.msgType == DLM.DRONE_LINK_MSG_TYPE_ADDR) {
            var temp = new Uint8Array(p.values, 0, p.numValues);
            temp.forEach((v)=>{ valueView.push(v)} );

          } else if (p.msgType == DLM.DRONE_LINK_MSG_TYPE_UINT32_T) {
            temp = new Uint32Array(p.values, 0, p.numValues);
            temp.forEach((v)=>{ valueView.push(v)} );
            //console.log("u32", valueView);

          } else if (p.msgType == DLM.DRONE_LINK_MSG_TYPE_FLOAT) {
            temp = new Float32Array(p.values, 0, p.numValues);
            temp.forEach((v)=>{ valueView.push(v)} );
            //console.log("F", valueView);

          } else if (p.msgType == DLM.DRONE_LINK_MSG_TYPE_CHAR) {
            valueView = [ p.values ];
          }
        } else {
          valueView = p.values;
        }
        //console.log(valueView)
        p.values = valueView;
      }
      return p.values
    } else
      return defaultVal;
}


export function getParamObjFromChannel(channelObj, param) {
  if (channelObj &&
      channelObj.params &&
      channelObj.params[param]
    ) {
      return channelObj.params[param]
    } else
      return null;
}



// cs = channelState
// addr = address in array form, e.g. [ node, channel, param ]
export function getObjectsForAddress(cs, addr) {
  var node, channel, param;
  if (cs[addr[1]]) {
    node = cs[addr[1]];

    if (node.channels && node.channels[addr[2]]) {
      channel = node.channels[addr[2]];
      param = getParamObjFromChannel(channel, addr[3]);

      if (param) {
        return {
          node: node,
          channel: channel,
          param: param
        }
      } else
        return null;

    } else
      return null;
  } else
    return null;
}
