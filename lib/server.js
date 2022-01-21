'use strict';

const http=require("http");
const path=require("path")
const zlib=require("zlib")
const fs=require("fs")
const crypto=require("crypto");
const os=require("os")
const {readFile,stat,readdir}=require("fs/promises");
const {Readable}=require("stream")

const handleBars=require("handlebars");
const mime =require("mime")
const marked =require("marked")

const logger=require("./utils/logger")
const defaultTemplate= handleBars.compile(require("./template/default_template"))

const interfaces=os.networkInterfaces()

module.exports= class Server {
    constructor(options={}){
        this.port=options.port||3000
        this.defaultShowPage=options.defaultShowPage||"index.html"
        this.cors=options.cors||true
        this.maxAge=options.maxAge||3600
        this.charset=options.charset||'utf-8'
        this.needCompressExes=["img","js","html","png"]
    }

    /**
     * 
     * @param {string} exe 
     * @returns {Boolean}
     */
    isNeedCompress(extName){
       return this.needCompressExes.includes(extName)
    }

    isMdFile(extName){
        return extName==="md"
    }

    /**
     * 判断客户端是否应该继续使用缓存
     * @param {*} req 
     * @param {*} serverModifiedTime 
     * @param {*} etag 
     * @returns {Boolean}
     */
    isShouldReturn304(req,serverModifiedTime,etag){
        const ifNoneMatch=req.headers["if-none-match"];
        const ifModifiedSince=req.headers["if-modified-since"];

        if(!ifNoneMatch&&!ifModifiedSince) return false
        
        if(ifNoneMatch!==etag&&+new Date(ifModifiedSince)!==+new Date(serverModifiedTime)){
            return false
        }
          
        return true
    }
    
    /**
     * 首次请求需要设置缓存
     * @param {*} res 
     * @param {*} stat 
     * @param {string} etag 
     */
    setCache(res,stat,etag){
        const lastModified= new Date(stat.mtime).toGMTString();
        //设置一小时后过期
        const expiresTime= new Date(+new Date()+60*60*1000).toGMTString();
        //Cache-Control 强缓存http1.1 
        //public：资源客户端和代理服务器都可以缓存。
        //privite：资源只有客户端可以缓存。
        //no-cache：客户端缓存资源，但是是否缓存需要经过协商缓存来验证。
        //no-store：不使用缓存。
        //max-age：缓存保质期。
        res.setHeader('Cache-Control', `public, max-age=${this.maxAge}`);
        //expires 强缓存http1.0; 
        //本地GMT时间格式,但是本地时间可以自己修改
        res.setHeader('expires', expiresTime);
        
        //Last-Modified 协商缓存 http1.0 
        //服务器响应给客户端文件的最后修改日期，下次请求时请求头携带if-modified-since字段值为上次请求返回的Last-Modified值.
        res.setHeader('Last-Modified', lastModified);
    
         //Etag 协商缓存 http1.1 
        //服务器响应给客户端能表示该文件的唯一标识，下次请求时请求头携带if-modified-since字段值为上次请求返回的Etag值.
        res.setHeader('Etag', etag);
    
    }

    /**
     * 创建可读流，并支持分段返回内容
     * @param {*} req 
     * @param {*} res 
     * @param {*} pathName 
     * @param {*} stat 
     * @returns readStream
     */
   async getReadStream(req,res, pathName,stat){

        let start=0;
        let end=stat.size-1
        const range =  req.headers["range"]
        if(range){
            res.setHeader("Accept-Range","bytes");
            res.statusCode=206;
            const [rangeStart,rangeEnd] = req.headers["range"].split("=")[1].split("-");
            start=isNaN(+rangeStart)?start:+rangeStart
            end=isNaN(+rangeEnd)?end:+rangeEnd
        }
        
       
        return fs.createReadStream(process.cwd()+pathName,{ start, end })
    }
    
    
    /**
     * 压缩文件
     * @param {*} req 
     * @param {*} res 
     * @param {*} readStream 
     * @returns readStream of zlib
     */
    handleCompressFile(req,res,readStream){
        const acceptEncoding = req.headers["accept-encoding"];
        if(!acceptEncoding){
            return readStream
        } else if(acceptEncoding.includes("gzip")){
            res.setHeader( 'Content-Encoding', 'gzip' );
            return readStream.pipe(zlib.createGzip())
         }else if(acceptEncoding.includes("deflate")){
            res.setHeader( 'Content-Encoding', 'deflate' );
           return readStream.pipe(zlib.createDeflate())
         }
    }

    /**
     * 处理markdown文件，转为html格式内容
     * @param {string} filePath 
     * @returns readStream
     */
     handleMdFile(filePath){      
             const mdFile=fs.readFileSync(filePath,{encoding:"utf-8"});
             const rs = new Readable();
             rs.push(marked.parse(mdFile));
             rs.push(null);//push null 代表可读流关闭
             return rs
     }
    

    /**
     * 404处理
     * @param {*} res 
     */
    responseNotFound(res){
        const rs= fs.createReadStream("./404.html")
        res.writeHead(404, {'Content-Type': 'text/html'})
        rs.pipe(res)
    }

    /**
     * 文件夹处理
     * @param {*} res 
     * @param {string} pathName 
     * @param {Array} files 
     */
    async responseDirectory(res,pathName,files){
        const fileList=[]
        for (const file of files) {
           const stats= await stat(path.join(process.cwd()+pathName,file));
           fileList.push({
               filePath:path.join(pathName,file),
               fileName:file,
               isDirectory:stats.isDirectory()
           })
        }
        const result= defaultTemplate({currentPath:pathName,fileList})
    
        res.writeHead(200,{'Content-Type': mime.getType(pathName)+';charset=utf-8',})
        res.end(result)
    }

    /**
     * 文件处理
     * @param {*} req 
     * @param {*} res 
     * @param {string} pathName 
     * @param {object} stat 
     */
    async responseFile(req, res,pathName ,stat){

        res.setHeader('Content-Type',mime.getType(pathName)+`;charset=${this.charset}`)

        if(this.cors) res.setHeader('Access-Control-Allow-Origin', "*")
       
        const filePath=process.cwd()+pathName
        const extName = path.extname(filePath).slice(1);
       
        const hash = crypto.createHash('sha1'); //这里对文件加密，生成etag供缓存使用
        const lastModified= new Date(stat.mtime).toGMTString();//文件的最后修改时间

        let readStream=fs.createReadStream(filePath);
       
        readStream.on('data', (data) => {
            hash.update(data);
        });
        readStream.on('end',async () => {
            const etag = hash.digest('hex');

            this.setCache(res,stat,etag)       
            
           if(this.isShouldReturn304(req,lastModified,etag)){
                res.statusCode=304;
                return res.end();
            }
             
            //这里需要用新建的可读流，因为上个可读流已经流空
            // let rs= fs.createReadStream(process.cwd()+pathName)
            let rs =  await this.getReadStream(req,res, pathName,stat)
            
            if(this.isNeedCompress(extName)){
                rs = this.handleCompressFile(req, res,rs)
            }
    
            if(this.isMdFile(extName)){
                rs=  this.handleMdFile(filePath)
                res.setHeader('Content-Type',`text/html;charset=${this.charset}`)
            }
    
             rs.pipe(res)
    
        })
    }
    
    /**
     * 处理路由
     * @param {*} req 
     * @param {*} res 
     * @param {*} pathName /test
     * @returns 
     */
    async handleRoute(req,res,pathName){
         const filePath=process.cwd()+pathName;

        let stats=''
          try {
               stats= await stat(filePath);
          } catch (error) {
              return  responseNotFound(res)
          }   

          if(stats.isDirectory()){
              const files =await readdir(filePath);
              //如果文件夹下有index.html,默认展示index.html内容
              files.includes(this.defaultShowPage)
              ?this.responseFile(req,res,path.join(pathName,this.defaultShowPage),stats)
              :this.responseDirectory(res,pathName,files)
          }else{ //文件操作
            this.responseFile(req, res,pathName,stats)
          }
    }

    /**
     * 获取本地s所有的ipv4地址
     * @param {*} interfaces 
     */
    getIPv4Addrs(interfaces){
       return Object.entries(interfaces).reduce((pre,[_,v])=>{
            v.forEach(x=>x.family==="IPv4"&& pre.push(x.address))
            return pre
        },[])
    }
   
    startServe(){
        logger.info(`Starting up liou-server, serving ${'./'.green}`)
        
        const callback=(req,res)=>{
            const pathName=req.url;
            if(pathName==="/favicon.ico"){
              return  this.responseNotFound(res)
            }        
            this.handleRoute(req,res,pathName)
        }

        const server=http.createServer(callback).listen(this.port)   
        
        const addrs= this.getIPv4Addrs(interfaces);
       
        server.on("listening",()=>{
            logger.info('Available on:'.yellow)
            addrs.map(addrs=>logger.base(`\thttp://${addrs}:${String(this.port).green}`))
            logger.info('Hit CTRL-C to stop the server');
        })

       //如果端口被占用自动将端口号加1
       server.on("error",(err)=>{
         logger.error(`address already in use ${this.port}`);
         logger.info(`server is trying ${this.port+1} ...`)
         server.listen(++this.port)
       })
    }



    run(){
        this.startServe()
    }

}

process.on('SIGINT', function () {
    logger.error('SIGINT server stopped.')
    process.exit();
});
  
process.on('SIGTERM', function () {
    logger.error('SIGTERM server stopped.')
    process.exit();
});



process.on("unhandledRejection",(reason)=>{
    logger.error(`unhandledRejection ${reason}`)
})