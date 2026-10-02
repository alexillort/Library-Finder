import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('out');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.txt':'text/plain','.woff2':'font/woff2'};
try{await stat(resolve(root,'index.html'));}catch{console.error('Primero ejecuta npm run build.');process.exit(1);}
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');let path=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  if((await stat(path).catch(()=>null))?.isDirectory())path=resolve(path,'index.html');
  const body=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(body);
 }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('No encontrado');}
});
server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log(`Library Finder demo: http://127.0.0.1:${process.env.PORT||3000}`));
