// Actual G.1 policy/HTTP generator with a loopback-only socket adapter. Native
// HTTP integration deliberately substitutes TCP for ESP32's TLS/platform seam.
#include "CloudTelemetryHttp.h"
#include <arpa/inet.h>
#include <sys/socket.h>
#include <unistd.h>
#include <errno.h>
#include <signal.h>
#include <chrono>
#include <thread>
#include <iostream>
#include <string>
class Loopback:public telemetry::HttpIo {
    int fd=-1;
    std::chrono::steady_clock::time_point epoch=std::chrono::steady_clock::now();
public:
    ~Loopback(){close();}
    uint32_t now() override {return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-epoch).count();}
    bool running() override {return true;}
    bool connect(const char* host,uint16_t port) override {
        if(std::string(host)!="127.0.0.1") return false;
        fd=socket(AF_INET,SOCK_STREAM,0);
        sockaddr_in address={};address.sin_family=AF_INET;address.sin_port=htons(port);inet_pton(AF_INET,host,&address.sin_addr);
        return fd>=0 && ::connect(fd,reinterpret_cast<sockaddr*>(&address),sizeof address)==0;
    }
    size_t write(const uint8_t* p,size_t size) override {auto result=::send(fd,p,size,0);return result>0?size_t(result):0;}
    int read() override {
        unsigned char byte;auto result=recv(fd,&byte,1,MSG_DONTWAIT);
        if(result==1) return byte;
        if(!result || (errno!=EAGAIN&&errno!=EWOULDBLOCK)) close();
        return -1;
    }
    bool connected() override {return fd>=0;}
    void wait() override {std::this_thread::sleep_for(std::chrono::milliseconds(1));}
    void close() override {if(fd>=0){::close(fd);fd=-1;}}
};
int main(int argc,char** argv) {
    signal(SIGPIPE,SIG_IGN);
    if(argc!=2) return 2;
    std::string domain,key;std::getline(std::cin,domain);std::getline(std::cin,key);
    telemetry::Config config;
    const std::string endpoint=std::string("https://127.0.0.1:")+argv[1];
    config.apply("endpoint",endpoint.c_str());config.apply("domain",domain.c_str());config.apply("apiKey",key.c_str());config.apply("subscriptions","@>4.8");
    if(!config.complete()) return 3;
    const uint8_t one[]={0,11,4,8,0,9},two[]={12,12,5,10,0x42,'A','B','C'};
    telemetry::Report report;telemetry::Cycle cycle;report.start(0,1000);
    report.capture(one,sizeof one);report.capture(two,sizeof two);
    if(!report.begin(1000,true,cycle)) return 4;
    Loopback io;telemetry::PackedHttp sender(io);
    const auto result=sender.sendBatch(config,cycle,0,cycle.count,254);
    if(result.attempted) report.finish(cycle,cycle.count);
    telemetry::Cycle next;
    const bool repeat=report.begin(2000,true,next);
    std::cout<<"{\"complete\":"<<(result.complete?"true":"false")<<",\"status\":"<<result.status<<",\"admitted\":"<<result.admitted<<",\"repeat\":"<<(repeat?"true":"false")<<"}\n";
    return 0;
}
