#pragma once
#include <arpa/inet.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>
#include <cstring>

class WiFiClientSecure {
  int fd=-1;
public:
  ~WiFiClientSecure(){stop();}
  void setInsecure(){}
  void setHandshakeTimeout(unsigned){}
  void setTimeout(unsigned){}
  bool connected(){return fd>=0;}
  bool connect(const char* host,unsigned port,int) {
    stop();
    if(strcmp(host,"127.0.0.1") || !port || port>65535) return false;
    fd=socket(AF_INET,SOCK_STREAM,0);
    if(fd<0) return false;
    sockaddr_in addr={};
    addr.sin_family=AF_INET;addr.sin_port=htons(port);addr.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
    if(::connect(fd,reinterpret_cast<sockaddr*>(&addr),sizeof addr)) {stop();return false;}
    return true;
  }
  unsigned available() {
    if(fd<0) return 0;
    pollfd descriptor={fd,POLLIN,0};
    return poll(&descriptor,1,1)>0;
  }
  int read() {
    unsigned char byte;
    if(fd>=0 && recv(fd,&byte,1,MSG_DONTWAIT)==1) return byte;
    stop();return -1;
  }
  size_t write(const uint8_t* bytes,size_t size) {
    if(fd<0) return 0;
    const auto written=send(fd,bytes,size,0);
    return written>0 ? written : 0;
  }
  void stop() {if(fd>=0) {close(fd);fd=-1;}}
};
