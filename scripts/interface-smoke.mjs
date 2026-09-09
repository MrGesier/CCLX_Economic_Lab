/** Render/integration smoke tests without browser or external dependencies. */
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {runStress} from '../src/stress.js';
import {runCurveSimulation} from '../src/curve-simulation.js';
import {optimizeCurveConfig} from '../src/curve-optimizer.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function runInterfaceSmoke(){
 const checks=[],listeners={},storage=new Map(),elements=new Map();
 const rootEl={innerHTML:''},toastEl={textContent:'',className:'',hidden:true};
 elements.set('#root',rootEl);elements.set('#toast',toastEl);
 const document={querySelector:s=>elements.get(s)||null,querySelectorAll:()=>[],addEventListener:(name,fn)=>listeners[name]=fn,createElement:()=>({click(){},remove(){},setAttribute(){},style:{}}),body:{append(){}}};
 const location={hash:'',reload(){}};
 const window={location,addEventListener:(name,fn)=>listeners['window:'+name]=fn,scrollTo(){},toastTimer:null};
 class FakeWorker{constructor(){this.terminated=false;}postMessage(m){queueMicrotask(()=>{if(this.terminated)return;try{let result;if(m.kind==='curve-sim'){const c=structuredClone(m.config);c.horizonDays=Math.min(c.horizonDays,12);c.participants.initial=Math.min(c.participants.initial,30);c.totalInitialParticipants=c.participants.initial;result=runCurveSimulation(c,{seed:c.seed,scenario:m.scenario});}else if(m.kind==='curve-optimize'){const c=structuredClone(m.config);c.horizonDays=8;c.participants.initial=20;c.totalInitialParticipants=20;result=optimizeCurveConfig(c,{budget:3,selectionSeeds:[1],validationSeeds:[9]});}else result=runStress(m.config,{...m.scenario,paths:Math.min(m.config.stress.paths,3),months:Math.min(m.config.stress.months,6)});this.onmessage({data:{id:m.id,type:'done',kind:m.kind,result}});}catch(e){this.onmessage({data:{id:m.id,type:'error',kind:m.kind,error:e.message}});}});}terminate(){this.terminated=true;}}
 const context=vm.createContext({document,window,location,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},Worker:FakeWorker,crypto:{randomUUID},structuredClone,console,Math,Number,String,Boolean,Array,Object,Set,Map,Date,JSON,RegExp,Error,TypeError,Infinity,NaN,parseInt,parseFloat,isNaN,URL,Blob,setTimeout,clearTimeout,queueMicrotask,confirm:()=>true});
 const code=await readFile(resolve(root,'src/app.js'),'utf8');
 const mod=new vm.SourceTextModule(code+'\nglobalThis.__labTest={pages,render,state,handleAction,changeConfig,applyJSON};',{context,identifier:pathToFileURL(resolve(root,'src/app.js')).href});
 await mod.link(async(specifier,ref)=>{const url=new URL(specifier,ref.identifier);const ns=await import(url.href);return new vm.SyntheticModule(Object.keys(ns),function(){for(const k of Object.keys(ns))this.setExport(k,ns[k]);},{context,identifier:url.href});});
 await mod.evaluate();const api=context.__labTest;
 const check=(name,fn)=>{fn();checks.push(name);};
 const has=(text)=>{if(!rootEl.innerHTML.includes(text))throw Error('Missing rendered text: '+text);if(rootEl.innerHTML.includes('<h2>Render error</h2>'))throw Error('Render error: '+rootEl.innerHTML.slice(0,500));};
 check('Overview renders',()=>has('A product prototype and a quantitative lab'));
 for(const [page,expected] of [['mock','Application sandbox'],['curve-lab','Bonding Curve Lab'],['liquidity','Initial liquidity & market depth'],['funding','Funding, vesting & unlocks'],['stress','Monte Carlo & economic resilience'],['exploits','Exploit & adversarial economics'],['calibration','Market calibration'],['assumptions','Assumptions, governance & launch gates']])check('Render '+page,()=>{api.state.page=page;api.render();has(expected);});
 check('Funding tables include the full round valuation and vesting structure',()=>{api.state.page='funding';api.render();has('$7,680,000');has('Strategic');has('Private 3');has('Restricted conversion capacity');});
 check('Mock purchase and allocation mutate balances',()=>{api.state.page='mock';api.state.mockAmount=1000;api.state.mockSide='buy';api.handleAction('mock-trade');if(api.state.mock.wallet.liquid<=0)throw Error('No purchased tokens');elements.set('#allocation-source',{value:'liquid'});elements.set('#pool-amount',{value:'1000'});api.handleAction('mock-allocate');if(!api.state.mock.wallet.positions.length)throw Error('Missing position');});
 check('Mock accrual and claim work',()=>{api.handleAction('advance-30');api.handleAction('mock-claim');if(api.state.mock.wallet.rewardLiquid<=0&&api.state.mock.wallet.usd<=24000)throw Error('No rewards paid');});
 check('Restricted conversion is never a liquid token issuance',()=>{api.state.mockSide='convert';api.state.mockAmount=75000;api.handleAction('mock-trade');if(api.state.mock.wallet.unvestedRestricted<=0)throw Error('No restricted issue');});
 check('Attack suite renders real results',()=>{api.state.page='exploits';api.handleAction('run-attacks');if(api.state.attacks.failed)throw Error('Attack suite failure');has('reentrancy');});
 check('Configuration validation rejects inconsistent changes',()=>{const before=api.state.mock.wallet.usd;try{api.changeConfig({dataset:{config:'supply'},value:'1'});}catch{}if(api.state.mock.wallet.usd!==before)throw Error('Invalid change mutated state');});
 api.state.page='stress';api.handleAction('run-stress');await new Promise(r=>setTimeout(r,50));if(!api.state.stress?.series)throw Error('Worker did not return results');has('Monthly stress heatmap');
 checks.push('Monte Carlo worker integration completes');
 api.state.page='curve-lab';api.state.curveTab='simulation';api.handleAction('run-curve');await new Promise(r=>setTimeout(r,50));if(!api.state.curveResult?.daily?.length)throw Error('Curve worker did not return series');has('Daily series');checks.push('Bonding Curve Lab worker integration completes');
 api.state.curveTab='optimizer';api.handleAction('run-curve-optimizer');await new Promise(r=>setTimeout(r,50));if(!api.state.curveOptimizer?.candidates?.length)throw Error('Curve optimizer did not return candidates');has('Candidate results');checks.push('Bonding Curve Lab optimizer renders candidates');
 return {passed:checks.length,checks,mode:'Node VM render/integration smoke; not a browser or Android rendering test'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 runInterfaceSmoke().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;});
}
