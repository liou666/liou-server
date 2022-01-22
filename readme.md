# node 静态资源服务器

> 参考`http-server`的开源库，完成的一个简易版的静态资源服务器。

### 安装 🔧
```shell
npm install -g liou-server 
```

### 运行 🚀
```shell
liou-server -p 8000
#or
s -p 8000
```

### 启动参数 😀

|  简写   | 整写  | 描述|默认值|
|  :----  | :---  |:----|:----|
| -p  | --port |启动端口|3000|
| -c  | --cors |是否跨域|false|
| -m | --max-age |强缓存的有效时间|3600（秒）|
| -ch  | --charset |是否打开默认文件|true|
| -o  | --open-default|是否打开默认文件|true|
| -d  | --default-show-page |默认打开的文件|index.html|

### ToDo  🖊

- [x] 支持跨域设置 
- [x] 支持缓存策略
- [x] 支持markdown文件在线预览
- [ ] 支持https协议
- [ ] 美化界面






