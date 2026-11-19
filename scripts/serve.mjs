import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT || 4781);
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.glb':'model/gltf-binary'};
http.createServer(async (req,res)=>{
  try {
    const route = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (route === '/api/treinta') {
      const {default: upstream} = await import('../api/treinta.mjs');
      const url = new URL(req.url,'http://localhost');
      const reply=await upstream.fetch(new Request(url,{method:req.method}));
      res.writeHead(reply.status,Object.fromEntries(reply.headers));
      return res.end(Buffer.from(await reply.arrayBuffer()));
    }
    const file=path.resolve(root,'.'+(route==='/'?'/index.html':route));
    if (!file.startsWith(path.resolve(root)+path.sep) || !(await stat(file)).isFile()) throw new Error('missing');
    res.setHeader('Content-Type',mime[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control','no-cache');
    if (req.method==='HEAD') return res.end();
    createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  } catch {if (!res.headersSent) res.writeHead(404);res.end('No encontrado');}
}).listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port));
