const http=require("http");
const colors = require('colors');

const {port}=require("./config")
const handler =require("./handler")


const server=http.createServer(handler)


server.listen(port,()=>{
console.log(`server is running ${port} ...`.green);
})


process.on("unhandledRejection",(reason)=>{
    console.log("unhandledRejection" + reason);
})