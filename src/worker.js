import {runStress,SCENARIOS} from './stress.js';
import {runCurveSimulation} from './curve-simulation.js';
import {optimizeCurveConfig} from './curve-optimizer.js';

self.onmessage=e=>{
 const {id,kind,config,scenario,all,options}=e.data;
 try{
  if(kind==='curve-sim'){
   const r=runCurveSimulation(config,{seed:options?.seed??config.seed,scenario:scenario||{},onProgress:p=>self.postMessage({id,type:'progress',progress:p})});
   self.postMessage({id,type:'done',kind,result:r});return;
  }
  if(kind==='curve-optimize'){
   const r=optimizeCurveConfig(config,{...(options||{}),onProgress:p=>self.postMessage({id,type:'progress',progress:p})});
   self.postMessage({id,type:'done',kind,result:r});return;
  }
  if(all){const results=[];for(let i=0;i<SCENARIOS.length;i++){const s=SCENARIOS[i];const r=runStress(config,{...s.changes,paths:Math.min(config.stress.paths,100)},p=>self.postMessage({id,type:'progress',progress:(i+p)/SCENARIOS.length}));results.push({id:s.id,name:s.name,summary:r.summary,painZones:r.painZones});}self.postMessage({id,type:'done',result:{scenarios:results}});}
  else{const r=runStress(config,scenario||{},p=>self.postMessage({id,type:'progress',progress:p}));self.postMessage({id,type:'done',result:r});}
 }catch(error){self.postMessage({id,type:error.message==='cancelled'?'cancelled':'error',kind,error:error.message});}
};
