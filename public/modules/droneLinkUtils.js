
export function getParamValueFromChannel(channelObj, param, defaultVal) {
  var p = getParamObjFromChannel(channelObj, param);
  if (p && p.values) {
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
