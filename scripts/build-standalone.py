from pathlib import Path
import re,json,gzip,base64
root=Path(__file__).resolve().parents[1]
src=root/'src'
modules={}
for path in sorted(src.glob('*.js')):
    if path.name=='worker.js': continue
    code=path.read_text()
    code=re.sub(r"^import\s*\{([^}]*)\}\s*from\s*['\"]\./([^'\"]+)['\"];?\s*$",lambda m:"const {"+m.group(1)+"}=__require("+json.dumps(m.group(2).removesuffix('.js'))+");",code,flags=re.M)
    names=[]
    def export(m):
        names.append(m.group(2));return m.group(1)
    code=re.sub(r'^export\s+((?:async\s+)?function|class|const|let)\s+([A-Za-z_$][\w$]*)',export,code,flags=re.M)
    if re.search(r'^\s*(?:import|export)\s',code,re.M):raise RuntimeError('Untransformed module syntax: '+path.name)
    if path.name=='app.js':
        code=code.replace("new Worker('/src/worker.js'",'new Worker(window.__LAB_WORKER_URL')
    modules[path.stem]={'code':code,'exports':names}

def make_bundle(names,entry):
    out=['const __modules=Object.create(null),__cache=Object.create(null);',
         'function __require(name){if(__cache[name])return __cache[name];const f=__modules[name];if(!f)throw Error("Missing module: "+name);return __cache[name]=f();}']
    for n in names:
        m=modules[n]
        out.append('__modules['+json.dumps(n)+']=function(){'+m['code']+'\nreturn {'+','.join(m['exports'])+'};};')
    out.append('__require('+json.dumps(entry)+');')
    return '\n'.join(out)
allnames=list(modules)
worker_code=(src/'worker.js').read_text()
worker_code=re.sub(r"^import\s*\{([^}]*)\}\s*from\s*['\"]\./([^'\"]+)['\"];?\s*$",lambda m:"const {"+m.group(1)+"}=__require("+json.dumps(m.group(2).removesuffix('.js'))+");",worker_code,flags=re.M)
modules['worker']={'code':worker_code,'exports':[]}
main=make_bundle(allnames,'app')
worker=make_bundle([n for n in allnames if n!='app'],'worker')
worker=worker.replace('/*DEBUG*/','')
css=(root/'styles.css').read_text()
payload=json.dumps({'main':main,'worker':worker,'css':css},separators=(',',':'),ensure_ascii=False)
packed=base64.b64encode(gzip.compress(payload.encode(),compresslevel=9,mtime=0)).decode()
html='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#172b32"><title>CCLX — Economic Lab</title><meta name="description" content="Synthetic CCLX product and economic stress-testing laboratory"></head><body><div id="root"><div style="font:16px system-ui;padding:32px"><h2>CCLX Economic Lab</h2><p id="boot-status">Loading the research sandbox…</p></div></div><script type="module">
const data="'''+packed+'''";
async function unpack(s){const bytes=Uint8Array.from(atob(s),c=>c.charCodeAt(0));const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));return JSON.parse(await new Response(stream).text());}
try{const p=await unpack(data);const style=document.createElement('style');style.textContent=p.css;document.head.append(style);window.__LAB_WORKER_URL=URL.createObjectURL(new Blob([p.worker],{type:'text/javascript'}));await import(URL.createObjectURL(new Blob([p.main],{type:'text/javascript'})));}catch(e){console.error(e);document.getElementById('root').innerHTML='<div style="font:16px system-ui;padding:32px"><h2>Could not start the lab</h2><p>'+String(e.message).replace(/[&<>]/g,'')+'</p><p>Use a recent Chrome, Firefox or Safari browser with JavaScript enabled.</p></div>';}
</script></body></html>'''
out=root/'standalone.html';out.write_text(html)
print(json.dumps({'path':str(out),'bytes':out.stat().st_size,'source_bytes':len(payload.encode()),'main_bytes':len(main),'worker_bytes':len(worker),'gzip_bytes':len(base64.b64decode(packed))},indent=2))
