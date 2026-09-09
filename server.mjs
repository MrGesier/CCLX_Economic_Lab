import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = resolve(process.env.CCLX_ROOT || fileURLToPath(new URL('./dist/', import.meta.url)));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png'};
const server = http.createServer(async(req,res)=>{
  try {
    let name = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (name === '/') name='/index.html';
    let file=resolve(root,'.'+name);
    if (!file.startsWith(root+sep) && file!==root) {res.writeHead(403);res.end('Forbidden');return;}
    const st=await stat(file).catch(()=>null);
    if (!st?.isFile()) {res.writeHead(404);res.end('Not found');return;}
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);
  } catch(e){res.writeHead(500);res.end('Server error');console.error(e);}
});
server.on('error', error => { console.error('Impossible de demarrer:', error.message); process.exitCode = 1; });
server.listen(port,host,()=>{
  const url = `http://127.0.0.1:${server.address().port}`;
  console.log(`CCLX Lab : ${url}`);
  console.log('Gardez cette fenetre ouverte. Fermez-la pour arreter le tool.');
  if (process.env.CCLX_OPEN_BROWSER === '1' && process.platform === 'win32') {
    const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {stdio:'ignore'});
    child.on('error', () => console.log('Ouvrez cette adresse dans votre navigateur:', url));
  }
});
