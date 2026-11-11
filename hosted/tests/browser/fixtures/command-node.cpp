#include "droneModules/CloudTelemetryModule.h"
#include "DroneSystem.h"
#include "WiFi.h"
#include <cassert>
#include <csignal>
#include <iostream>
#include <vector>

uint32_t hostTime=0;
Logger Log;
ESPClass ESP;
WiFiClass WiFi;
thread_local Task* currentTask=nullptr;
bool taskAllocationFails=false;

#define DRONE_LINK_PARAM_ALL 0
struct DroneLinkChannelSubscription {DroneModule* module;unsigned param,extNode;};
template<class T> class Queue {
public:
  std::vector<T> values;
  int size(){return values.size();}
  T get(unsigned i){return values.at(i);}
  T shift(){auto value=get(0);remove(0);return value;}
  void remove(unsigned i){values.erase(values.begin()+i);}
};
struct DroneLinkQueueEntry {DroneLinkMsg message;bool cloudRequest;};
class DroneLinkChannel {
public:
  unsigned _cloudRequests=0,_cloudWaitTurns=0;
  Queue<DroneLinkQueueEntry*> _queue;
  Queue<DroneLinkChannelSubscription*> _subs;
  DroneLinkManager* _dlm;
  void processQueue();
};
#include "actual_channel.inc"

class FixtureParameter:public DroneModule {
public:
  unsigned value=42,writes=0,queries=0,names=0;
  explicit FixtureParameter(DroneSystem* system):DroneModule(4,system){}
  void handleLinkMessage(DroneLinkMsg* msg) override {
    assert(msg->node()==7 && msg->channel()==4 && msg->param()==8);
    assert(!msg->writable());
    if(msg->type()==0) {
      value=msg->_msg.payload.uint8[0];
      ++writes;
      return;
    }
    DroneLinkMsg publication;
    publication._msg.node=7;
    publication._msg.channel=4;
    publication._msg.param=8;
    if(msg->type()==7) {
      ++queries;
      publication._msg.typed=128;
      publication._msg.payload.uint8[0]=value;
    } else {
      assert(msg->type()==6);
      ++names;
      publication._msg.typed=0x56;
      memcpy(publication._msg.payload.uint8,"Fixture",7);
    }
    _dlm->publishLocal(publication);
  }
};

int main(int argc,char** argv) {
  assert(argc==3);
  std::signal(SIGPIPE,SIG_IGN);
  std::string domain,key;
  assert(std::getline(std::cin,domain) && std::getline(std::cin,key));
  DroneLinkManager dlm;dlm.address=7;
  DroneModuleManager dmm;
  DroneSystem system{&dlm,&dmm};
  FixtureParameter fixture(&system);
  fixture.value=std::stoul(argv[2]);
  assert(fixture.value<=255);
  DroneLinkChannel channel;channel._dlm=&dlm;
  DroneLinkChannelSubscription target{&fixture,0,7};
  channel._subs.values.push_back(&target);
  CloudTelemetryModule module(20,&system);
  const auto endpoint=std::string("https://127.0.0.1:")+argv[1];
  module.configure("endpoint",endpoint.c_str());
  module.configure("domain",domain.c_str());
  module.configure("apiKey",key.c_str());
  module.configure("subscriptions","@>5.*");
  module.setup();
  assert(module._enabled && !module._error);
  module.loop();
  hostTime=10000;
  for(unsigned i=0;i<32;++i) {
    module.loop();
    if(dlm.pendingCloud) {
      channel._queue.values.push_back(new DroneLinkQueueEntry{dlm.issued.back(),true});
      channel._cloudRequests=1;
      channel.processQueue();
      dlm.pendingCloud=false;
    }
    ++hostTime;
  }
  std::cout<<"{\"writes\":"<<fixture.writes<<",\"queries\":"<<fixture.queries
           <<",\"names\":"<<fixture.names<<",\"value\":"<<fixture.value
           <<",\"uploads\":"<<module._params[1].data.uint32[1]
           <<",\"failures\":"<<module._params[1].data.uint32[2]<<"}\n";
}
