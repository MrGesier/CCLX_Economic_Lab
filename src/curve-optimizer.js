import {clone,div,quantile,sum} from './model.js';
import {rng} from './stress.js';
import {mergeCurveLabConfig} from './curve-sim-config.js';
import {runCurveSimulation} from './curve-simulation.js';

function setPath(obj,path,value){
 const keys=path.split('.');let o=obj;
 for(const k of keys.slice(0,-1)){o[k]??={};o=o[k];}
 o[keys.at(-1)]=value;
}

function sampleSpec(spec,r){
 if(spec.values)return spec.values[Math.floor(r()*spec.values.length)];
 const min=spec.min??0,max=spec.max??1,v=min+(max-min)*r();
 return spec.type==='integer'?Math.round(v):v;
}

export const DEFAULT_SEARCH_SPACE={
 initialProjects:{type:'integer',values:[2,3,5]},
 targetProjects:{type:'integer',values:[3,5,10]},
 launchIntervalDays:{type:'integer',min:30,max:365},
 minDemandBeforeLaunchCCLX:{type:'number',min:0,max:1000000},
 mintFee:{type:'number',min:0,max:.03},
 redemptionFee:{type:'number',min:0,max:.05},
 slopeScale:{type:'number',min:.5,max:2},
 cooldownDays:{type:'integer',values:[0,7,30,90]}
};

export const DEFAULT_CONSTRAINTS=[
 'p95WithdrawalSlippage <= 0.05',
 'rejectedDemandRate <= 0.10',
 'medianProjectUtilization >= 0.20',
 'accountingResidualCCLX == 0'
];

function candidateConfig(base,params){
 const cfg=clone(base),initial=Math.min(params.initialProjects,params.targetProjects),target=params.targetProjects,interval=params.launchIntervalDays;
 cfg.projectSchedule=[{day:0,targetActiveProjects:initial},{day:interval,targetActiveProjects:Math.max(initial,Math.ceil((initial+target)/2))},{day:interval*2,targetActiveProjects:target}];
 cfg.activity.cooldownDays=params.cooldownDays;
 cfg.fees.defaultMintFee=params.mintFee;cfg.fees.defaultRedemptionFee=params.redemptionFee;
 cfg.searchPolicy={minDemandBeforeLaunchCCLX:params.minDemandBeforeLaunchCCLX};
 for(const p of cfg.projects){
  p.fees.mintFee=params.mintFee;p.fees.redemptionFee=params.redemptionFee;
  if(p.curve.family==='linear'&&Number.isFinite(p.curve.b))p.curve.b*=params.slopeScale;
  if(p.curve.family==='power')p.curve.convexity=Math.max(.25,(p.curve.convexity||1.35)*params.slopeScale);
 }
 return cfg;
}

function evaluateConstraints(summary){
 const violations=[];
 if(summary.p95WithdrawalSlippage>.05)violations.push('p95WithdrawalSlippage > 0.05');
 if(summary.rejectedDemandRate>.10)violations.push('rejectedDemandRate > 0.10');
 if(Math.abs(summary.accountingResidualCCLX)>1e-5)violations.push('accountingResidualCCLX != 0');
 if(summary.reserveAverageCCLX<=0)violations.push('reserveAverageCCLX <= 0');
 return violations;
}

function aggregateSeedRuns(runs){
 const summaries=runs.map(r=>r.summary),pick=k=>summaries.map(s=>s[k]).filter(Number.isFinite);
 return {
  grossFeesCCLX:quantile(pick('cumulativeFeesCCLX'),.5),
  netProtocolResult:quantile(pick('netProtocolResultUSD'),.5),
  netProtocolResultP05:quantile(pick('netProtocolResultUSD'),.05),
  retention90d:quantile(pick('retention90d'),.5),
  p95RoundTripCost:quantile(pick('p95RoundTripCost'),.95),
  p95WithdrawalSlippage:quantile(pick('p95WithdrawalSlippage'),.95),
  rejectedDemandRate:quantile(pick('rejectedDemandRate'),.95),
  accountingResidualCCLX:Math.max(...pick('accountingResidualCCLX').map(Math.abs),0),
  reserveAverageCCLX:quantile(pick('reserveAverageCCLX'),.5),
  validationSpread:pick('netProtocolResultUSD').length?quantile(pick('netProtocolResultUSD'),.95)-quantile(pick('netProtocolResultUSD'),.05):0
 };
}

function dominates(a,b){
 return a.feasible&&(!b.feasible||(
  a.netProtocolResult>=b.netProtocolResult&&
  a.retention90d>=b.retention90d&&
  a.p95RoundTripCost<=b.p95RoundTripCost&&
  (a.netProtocolResult>b.netProtocolResult||a.retention90d>b.retention90d||a.p95RoundTripCost<b.p95RoundTripCost)
 ));
}

export function optimizeCurveConfig(base,{searchSpace=DEFAULT_SEARCH_SPACE,constraints=DEFAULT_CONSTRAINTS,selectionSeeds=[101,102,103],validationSeeds=[901],budget=80,onProgress}={}){
 const random=rng(base.seed^0xA51CE),candidates=[];
 for(let i=0;i<budget;i++){
  const params=Object.fromEntries(Object.entries(searchSpace).map(([k,s])=>[k,sampleSpec(s,random)]));
  const cfg=candidateConfig(base,params),runs=[];
  let error='';
  try{for(const seed of selectionSeeds)runs.push(runCurveSimulation(cfg,{seed}));}catch(err){error=err.message;}
  const agg=error?{grossFeesCCLX:0,netProtocolResult:-Infinity,retention90d:0,p95RoundTripCost:Infinity,p95WithdrawalSlippage:Infinity,rejectedDemandRate:Infinity,accountingResidualCCLX:Infinity,reserveAverageCCLX:0,validationSpread:Infinity}:aggregateSeedRuns(runs);
  const violations=error?[error]:evaluateConstraints(agg);
  candidates.push({candidateId:`cand_${String(i+1).padStart(3,'0')}`,...params,...agg,seeds:selectionSeeds.join('|'),validationSeeds:validationSeeds.join('|'),constraints,violations,feasible:violations.length===0,paretoRank:null});
  if(onProgress&&(i%5===0||i===budget-1))onProgress((i+1)/budget);
 }
 for(const c of candidates)c.paretoRank=candidates.some(o=>o!==c&&dominates(o,c))?2:1;
 const feasible=candidates.filter(c=>c.feasible).sort((a,b)=>b.netProtocolResult-a.netProtocolResult||b.retention90d-a.retention90d||a.p95RoundTripCost-b.p95RoundTripCost);
 for(const c of feasible.slice(0,Math.min(5,feasible.length))){
  const cfg=candidateConfig(base,c),runs=[];
  try{for(const seed of validationSeeds)runs.push(runCurveSimulation(cfg,{seed}));const v=aggregateSeedRuns(runs);c.validationNetProtocolResult=v.netProtocolResult;c.validationSpread=v.validationSpread;c.validationRejectedDemandRate=v.rejectedDemandRate;}
  catch(err){c.violations.push('validation: '+err.message);c.feasible=false;}
 }
 return {schemaVersion:'curve-optimizer/1.0',budget,selectionSeeds,validationSeeds,searchSpace,constraints,candidates,pareto:candidates.filter(c=>c.paretoRank===1&&c.feasible),best:feasible[0]||null,summary:{tested:candidates.length,feasible:candidates.filter(c=>c.feasible).length,pareto:candidates.filter(c=>c.paretoRank===1&&c.feasible).length,medianNetProtocolResult:quantile(candidates.filter(c=>Number.isFinite(c.netProtocolResult)).map(c=>c.netProtocolResult),.5)}};
}

export function exportCandidatesCSV(result){
 const keys=['candidateId','initialProjects','targetProjects','launchIntervalDays','minDemandBeforeLaunchCCLX','mintFee','redemptionFee','slopeScale','cooldownDays','seeds','validationSeeds','grossFeesCCLX','netProtocolResult','validationNetProtocolResult','capitalExternal','retention90d','reserveAverageCCLX','p95RoundTripCost','p95WithdrawalSlippage','rejectedDemandRate','accountingResidualCCLX','feasible','paretoRank','violations','validationSpread'];
 return [keys,...result.candidates.map(c=>keys.map(k=>k==='violations'?c.violations.join('; '):k==='capitalExternal'?'' : c[k]??''))];
}
