function FindProxyForURL(url, host) {
    var index = Math.floor(Math.random() * 1000); // random từ 0 đến 999
    var port = 10000 + index;
    return "PROXY p.webshare.io:" + port;
  }