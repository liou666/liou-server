const fs=require("fs");
const path=require("path")
const {promisify}=require("util")
const zlib=require("zlib")
const crypto=require("crypto")

const handleBars=require("handlebars");
const mime =require("mime")

const readFile=promisify(fs.readFile)
const stat=promisify(fs.stat)
const readdir=promisify(fs.readdir)

const defaultTemplate= handleBars.compile(require("./template/default_template"))
// const defaultTemplate= handleBars.compile(require("./template/default_template"))
const {defaultShowPage,needCompressExtName,cors,maxAge}=require("./config")


function handleNotFound(res){
    const rs= fs.createReadStream("./404.html")
    res.writeHead(404, {'Content-Type': 'text/html'})
    rs.pipe(res)
}

async function handleFile(req, res,pathName ,stat){
    const extName = path.extname(process.cwd()+pathName).slice(1);
    const hash = crypto.createHash('sha1'); 
    const lastModified= new Date(stat.mtime).toGMTString();
    let readStream=fs.createReadStream(process.cwd()+pathName);
   
    readStream.on('data', (data) => {
        hash.update(data);
    });
    readStream.on('end',async () => {
        const etag = hash.digest('hex');
        setCache(res,stat,etag)
   
        if(cors){
            res.setHeader('Access-Control-Allow-Origin', "*")
        }
        
       if(isShouldReturn304(req,lastModified,etag)){
            res.statusCode=304;
            return res.end();
        }
    
        res.setHeader('Content-Type',mime.getType(pathName)+';charset=utf-8')
       
        //这里需要用新建的可读流，因为上个可读流已经流空
        // let rs= fs.createReadStream(process.cwd()+pathName)
    
        let rs =  await getReadStream(req,res, pathName,stat)
        if(isNeedCompress(extName)){
            rs = handleCompressFile(req, res,rs)
        }
    
         rs.pipe(res)

    })
}

async function getReadStream(req,res, pathName,stat){
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


async function handleDirectory(res,pathName,files){
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

    res.writeHead(200,{'Content-Type': 'text/html;charset=utf-8',})
    res.end(result)
}

function isShouldReturn304(req,serverModifiedTime,etag){
    const ifNoneMatch=req.headers["if-none-match"];
    const ifModifiedSince=req.headers["if-modified-since"];
    if(!ifNoneMatch&&!ifModifiedSince){
       return false
    }
  
    if(ifNoneMatch!==etag&&+new Date(ifModifiedSince)!==+new Date(serverModifiedTime)){
        return false
    }
    

    return true
}

//设置缓存
function setCache(res,stat,etag){
    const lastModified= new Date(stat.mtime).toGMTString();
    //设置一小时后过期
    const expiresTime= new Date(+new Date()+60*60*1000).toGMTString();
    //Cache-Control 强缓存http1.1 
    //public：资源客户端和代理服务器都可以缓存。
    //privite：资源只有客户端可以缓存。
    //no-cache：客户端缓存资源，但是是否缓存需要经过协商缓存来验证。
    //no-store：不使用缓存。
    //max-age：缓存保质期。
    res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
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


function isHasDefaultShowPage(files){
    return files.includes(defaultShowPage)
}
function isNeedCompress(extname){
    return  needCompressExtName.includes(extname)
}



function handleCompressFile(req,res,readStream){
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



module.exports=async (req,res)=>{
    const pathName=req.url;
    const filePath=process.cwd()+pathName;

    if(pathName==="/favicon.ico"){
      return  handleNotFound(res)
    }

    let stats=''

    try {
         stats= await stat(filePath);
    } catch (error) {
        return  handleNotFound(res)
    }
 

    if(stats.isDirectory()){//文件夹操作
        const files =await readdir(process.cwd()+pathName);
        isHasDefaultShowPage(files) 
        ?handleFile(req,res,path.join(pathName,defaultShowPage),stats)
        :handleDirectory(res,pathName,files)
    }else{ //文件操作
      handleFile(req, res,pathName,stats)
    }
     
    
  
}