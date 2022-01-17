const fs=require("fs");
const path=require("path")
const {promisify}=require("util")
const zlib=require("zlib")

const handleBars=require("handlebars");
const mime =require("mime")

const readFile=promisify(fs.readFile)
const stat=promisify(fs.stat)
const readdir=promisify(fs.readdir)

const defaultTemplate= handleBars.compile(require("./template/default_template"))
// const defaultTemplate= handleBars.compile(require("./template/default_template"))
const {defaultShowPage,needCompressExtName,cors}=require("./config")


function handleNotFound(res){
    const rs= fs.createReadStream("./404.html")
    res.writeHead(404, {'Content-Type': 'text/plain'})
    rs.pipe(res)
}

function handleFile(req, res,pathName){
    const extName = path.extname(process.cwd()+pathName).slice(1);
  
    let readStream=fs.createReadStream(process.cwd()+pathName);
    res.setHeader('Content-Type',mime.getType(pathName)+';charset=utf-8')
    if(cors){
     res.setHeader('Access-Control-Allow-Origin', "*")
    }

    if(isNeedCompress(extName)){
        readStream = handleCompressFile(req, res,readStream)
    }

    readStream.pipe(res)
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
    // console.log(fileList);
    res.writeHead(200,{'Content-Type': 'text/html;charset=utf-8',})
    res.end(result)
}



function isHasDefaultShowPage(files){
    return files.includes(defaultShowPage)
}
function isNeedCompress(extname){
    return  needCompressExtName.includes(extname)
}



function handleCompressFile( req,res,readStream){
    const acceptEncoding = req.headers["accept-encoding"];
    if(!acceptEncoding){
        return readStream
    } else if(acceptEncoding.includes("gzip")){
        res.writeHead(200, { 'Content-Encoding': 'gzip' });
        return readStream.pipe(zlib.createGzip())
     }else if(acceptEncoding.includes("deflate")){
       res.writeHead(200, { 'Content-Encoding': 'deflate' });
       return readStream.pipe(zlib.createDeflate())
     }

   
}



module.exports=async (req,res)=>{
    const pathName=req.url;
    const filePath=process.cwd()+pathName;

    if(pathName==="/favicon.ico"){
      return  handleNotFound(res)
    }

    const stats= await stat(filePath);

    if(stats.isDirectory()){//文件夹操作
        const files =await readdir(process.cwd()+pathName);
        isHasDefaultShowPage(files) 
        ?handleFile(req,res,path.join(pathName,defaultShowPage))
        :handleDirectory(res,pathName,files)
    }else{ //文件操作
      handleFile(req, res,pathName)
    }
     
    
  
}
//压缩
//缓存