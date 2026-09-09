import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const names=['model','curve','curve-families','curve-fees','curve-population','curve-sim-config','market','stress','curve-simulation','curve-optimizer','mock','attacks','analysis','calibration','app','worker'];

function transform(name,src){
 const exports=[];
 let code=src.replace(/^import\s+\{([^}]*)\}\s+from\s+['"]\.\/([^'"]+)['"];?\s*$/gm,(_,imports,path)=>`const {${imports}}=require(${JSON.stringify('./'+path.replace(/\.js$/,''))});`);
 code=code.replace(/^export\s+((?:async\s+)?function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm,(_,kind,id)=>{exports.push(id);return `${kind} ${id}`;});
 if(name==='app')code=code.replace("new Worker('/src/worker.js',{type:'module'})","new Worker(window.__CCLX_WORKER_URL)");
 if(/^\s*(import|export)\s/m.test(code))throw Error('Untransformed module syntax in '+name+'.js');
 return {code,exports};
}

const modules={};
for(const name of names){
 const src=await readFile(resolve(root,'src',name+'.js'),'utf8');
 modules[name]=transform(name,src);
}

function registry(keys){
 return `const __modules={${keys.map(n=>JSON.stringify(n)+`:function(module,exports,require){\n${modules[n].code}\nObject.assign(exports,{${modules[n].exports.join(',')}});\n}`).join(',\n')}};const __cache={};function require(path){let id=path.replace(/^\\.\\//,'').replace(/\\.js$/,'');if(!__modules[id])throw Error('Unknown module '+path);if(!__cache[id]){const m={exports:{}};__cache[id]=m;__modules[id](m,m.exports,require);}return __cache[id].exports;}\n`;
}

const workerKeys=['model','curve-families','curve-fees','curve-population','curve-sim-config','market','stress','curve-simulation','curve-optimizer','worker'];
const worker=registry(workerKeys)+"require('./worker.js');";
const mainKeys=names.filter(n=>n!=='worker');
const main=registry(mainKeys)+'window.__CCLX_WORKER_URL=URL.createObjectURL(new Blob(['+JSON.stringify(worker)+'],{type:"text/javascript"}));require("./app.js");';
const css=await readFile(resolve(root,'styles.css'),'utf8');
const favicon=await readFile(resolve(root,'public/favicon.svg'),'utf8');
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#172b32"><title>CCLX — Economic Lab</title><link rel="icon" href="data:image/svg+xml,'+encodeURIComponent(favicon)+'"><style>'+css+'</style></head><body><div id="root"><div class="boot"><div class="brand-mark">C</div><p>Loading CCLX Economic Lab...</p></div></div><script>'+main.replaceAll('</script','<\\/script')+'</script></body></html>';
await writeFile(resolve(root,'standalone.html'),html);
console.log('Standalone HTML:',Buffer.byteLength(html),'bytes');
