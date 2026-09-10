import {clone,div,sum,stats,quantile,clamp} from './model.js';
import {rng} from './stress.js';
import {spot,integral,inverseIntegral,curveSeries} from './curve-families.js';
import {curveForProject,defaultCurveLabConfig,mergeCurveLabConfig,validateCurveConfig} from './curve-sim-config.js';
import {buildParticipants,addDailyParticipants,chooseWeighted,profileById,shouldAct} from './curve-population.js';
import {createFeeAccounts,recordFee,summarizeFeeAccounts} from './curve-fees.js';

const EPS=1e-8;
const finite=(x,name,min=0)=>{const n=Number(x);if(!Number.isFinite(n)||n<min)throw Error(`${name} must be finite and >= ${min}.`);return n;};
const key=(projectId,restricted=false)=>projectId+'|'+(restricted?'restricted':'unrestricted');
const reserveOf=p=>p.floorBuffer.currency==='USD'?p.floorBuffer.convertedCCLX:p.floorBuffer.value;

export function phaseForProject(p,day){
 if(p.defaultDay!=null&&day>=p.defaultDay)return 'defaulted';
 if(p.closeDay!=null&&day>=p.closeDay)return 'closed';
 if(day<(p.createdDay??0))return 'not_created';
 if(day<(p.openDay??p.createdDay??0))return 'announced';
 if(p.fundraisingEndDay!=null&&day<p.fundraisingEndDay)return 'open_for_deposits';
 if(p.operatingDay!=null&&day<p.operatingDay)return 'funded';
 if(p.maturityDay!=null&&day>=p.maturityDay)return 'matured';
 return 'operating';
}

export function operationsForPhase(phase){
 return {
  deposit:['open_for_deposits','funded','operating'].includes(phase),
  withdraw:['open_for_deposits','funded','operating','matured','defaulted'].includes(phase),
  migrateIn:['open_for_deposits','funded','operating'].includes(phase),
  migrateOut:['open_for_deposits','funded','operating','matured','defaulted'].includes(phase),
  distributions:['operating','matured'].includes(phase)
 };
}

function scheduleDayForIndex(schedule,index){
 const sorted=[...(schedule||[])].sort((a,b)=>a.day-b.day);
 const item=sorted.find(s=>index<s.targetActiveProjects)||sorted.at(-1)||{day:0};
 return item.day??0;
}

export function materializeCurveProjects(config){
 const base=clone(config.projects),target=Math.max(base.length,...(config.projectSchedule||[]).map(s=>s.targetActiveProjects||0),1);
 const out=[];
 for(let i=0;i<target;i++){
  const template=base[i%base.length],copy=clone(template),arrival=i<base.length?copy.createdDay:scheduleDayForIndex(config.projectSchedule,i);
  if(i>=base.length){
   copy.id=`${template.id}_${i+1}`;copy.name=`${template.name} ${i+1}`;copy.origin='proposed_synthetic';copy.documentStatus='Generated project cohort; parameters synthetic and replayable.';
   copy.createdDay=arrival;copy.openDay=arrival+30;copy.fundraisingEndDay=arrival+180;copy.operatingDay=arrival+210;copy.maturityDay=arrival+1095;
  }
  out.push(copy);
 }
 if(config.networkMode==='fixed_total_resources'){
  const each=div(config.totalInitialReserveBudgetCCLX,out.length);
  for(const p of out)p.floorBuffer={value:each,currency:'CCLX',source:'shared_fixed_budget',origin:'proposed_synthetic',description:'Allocated from one fixed network reserve budget; not multiplied by project count.'};
 }
 return out;
}

export function makeVault(project){
 const curve=curveForProject(project),reserve=reserveOf(project),supply=inverseIntegral(curve,reserve);
 return {projectId:project.id,curve,backing:reserve,shares:supply,capacityCCLX:project.capacityCCLX,initialOwners:{[`initial_${project.id}`]:supply},fees:createFeeAccounts()};
}

export function quoteDeposit(vault,amount,{mintFee=0,allowPartial=false}={}){
 const requested=finite(amount,'deposit amount',0);
 if(requested<=0)throw Error('Deposit amount must be positive.');
 const remaining=Math.max(0,vault.capacityCCLX-vault.backing),maxGross=mintFee<1?remaining/(1-mintFee):0;
 const gross=allowPartial?Math.min(requested,maxGross):requested;
 if(gross+EPS<requested&&!allowPartial)throw Error('Project collateral capacity exceeded.');
 if(gross<=EPS)throw Error('No executable deposit capacity.');
 const fee=gross*mintFee,net=gross-fee,nextBacking=vault.backing+net,nextShares=inverseIntegral(vault.curve,nextBacking),shares=nextShares-vault.shares;
 const before=spot(vault.curve,vault.shares),after=spot(vault.curve,nextShares),avg=div(net,shares);
 return {side:'deposit',requested,gross,net,fee,shares,backingDelta:net,spotBefore:before,spotAfter:after,averagePrice:avg,averageSlippage:div(avg,before)-1,marginalMove:div(after,before)-1,partial:gross+EPS<requested,status:gross+EPS<requested?'partial':'executed'};
}

export function quoteWithdrawal(vault,shares,{redemptionFee=0}={}){
 const q=finite(shares,'withdrawal shares',0);
 if(q<=0)throw Error('Withdrawal shares must be positive.');
 if(q>vault.shares+EPS)throw Error('Insufficient receipt shares.');
 const target=Math.max(0,vault.shares-q),gross=vault.backing-integral(vault.curve,target),fee=gross*redemptionFee,output=gross-fee;
 const before=spot(vault.curve,vault.shares),after=spot(vault.curve,target),avg=div(gross,q);
 return {side:'withdraw',requested:q,shares:q,gross,net:output,output,fee,backingDelta:-gross,spotBefore:before,spotAfter:after,averagePrice:avg,averageSlippage:1-div(avg,before),marginalMove:div(after,before)-1,status:'executed'};
}

export function quoteWithdrawalAmount(vault,amount,{redemptionFee=0}={}){
 const net=finite(amount,'withdrawal output',0),full=quoteWithdrawal(vault,vault.shares,{redemptionFee}).output;
 if(net>full+EPS)throw Error('Withdrawal exceeds executable curve value.');
 const gross=net/(1-redemptionFee),targetBacking=vault.backing-gross,targetShares=inverseIntegral(vault.curve,Math.max(0,targetBacking));
 return quoteWithdrawal(vault,vault.shares-targetShares,{redemptionFee});
}

export function quoteMigration(state,intent){
 const from=state.vaults[intent.originProject],to=state.vaults[intent.destinationProject];
 if(!from||!to)throw Error('Unknown migration project.');
 if(intent.originProject===intent.destinationProject)throw Error('Migration destination must differ.');
 const out=quoteWithdrawal(from,intent.shares,{redemptionFee:intent.redemptionFee});
 const routingFee=out.output*(intent.routingFee||0),depositGross=out.output-routingFee;
 const into=quoteDeposit(to,depositGross,{mintFee:intent.mintFee,allowPartial:false});
 return {side:'migration',origin:out,destination:into,routingFee,inputShares:intent.shares,netMoved:depositGross,totalFees:out.fee+routingFee+into.fee,externalCapital:0,status:'executed'};
}

function mutateDeposit(state,p,vault,participant,amount,source,day,eventId,allowPartial=true){
 const q=quoteDeposit(vault,amount,{mintFee:p.fees.mintFee??state.config.fees.defaultMintFee,allowPartial});
 if(q.averageSlippage>state.config.activity.maxSlippage)throw Error('Deposit slippage limit exceeded.');
 participant.wallet[source]-=q.gross;
 vault.backing+=q.backingDelta;vault.shares+=q.shares;
 const k=key(p.id,source==='restricted'),pos=participant.positions[k]??={projectId:p.id,restricted:source==='restricted',shares:0,principalBasis:0};
 pos.shares+=q.shares;pos.principalBasis+=q.gross;participant.positions[k]=pos;
 const fee=recordFee(state.feeAccounts,{projectId:p.id,profile:participant.profileId,source,operation:'entry',gross:q.fee,priceUSD:state.priceUSD,allocations:state.config.fees.allocations});
 state.transactions.push({eventId,day,participantId:participant.id,cohortId:participant.profileId,action:'deposit',originProject:'wallet',destinationProject:p.id,requestedAmount:amount,unit:'CCLX',executedAmount:q.gross,sharesMinted:q.shares,sharesBurned:0,gross:q.gross,net:q.net,feesCCLX:q.fee,feeStatus:fee.status,currency:'CCLX',provenance:source,status:q.status,rejectionReason:'',slippage:q.averageSlippage,capitalNew:q.gross,capitalRecycled:0});
state.counters.deposits+=q.gross;state.counters.capitalNew+=q.gross;state.counters.actions++;chargeActionSubsidy(state);if(q.partial)state.counters.partial++;
 return q;
}

function mutateWithdrawal(state,p,vault,participant,pos,shares,day,eventId,action='withdraw'){
 const q=quoteWithdrawal(vault,shares,{redemptionFee:p.fees.redemptionFee??state.config.fees.defaultRedemptionFee});
 if(q.averageSlippage>state.config.activity.maxSlippage)throw Error('Withdrawal slippage limit exceeded.');
 vault.backing+=q.backingDelta;vault.shares-=q.shares;pos.shares-=q.shares;pos.principalBasis*=Math.max(0,1-div(q.shares,pos.shares+q.shares));
 const source=pos.restricted?'restricted':'unrestricted';participant.wallet[pos.restricted?'restricted':'unrestricted']+=q.output;
 const fee=recordFee(state.feeAccounts,{projectId:p.id,profile:participant.profileId,source,operation:'exit',gross:q.fee,priceUSD:state.priceUSD,allocations:state.config.fees.allocations});
 state.transactions.push({eventId,day,participantId:participant.id,cohortId:participant.profileId,action,originProject:p.id,destinationProject:'wallet',requestedAmount:shares,unit:'receipts',executedAmount:q.output,sharesMinted:0,sharesBurned:q.shares,gross:q.gross,net:q.output,feesCCLX:q.fee,feeStatus:fee.status,currency:'CCLX',provenance:source,status:'executed',rejectionReason:'',slippage:q.averageSlippage,capitalNew:0,capitalRecycled:q.output});
state.counters.withdrawals+=q.gross;state.counters.actions++;chargeActionSubsidy(state);
 return q;
}

function mutateMigration(state,fromP,toP,participant,pos,shares,day,eventId){
 const from=state.vaults[fromP.id],to=state.vaults[toP.id],source=pos.restricted?'restricted':'unrestricted';
 const quote=quoteMigration(state,{originProject:fromP.id,destinationProject:toP.id,shares,redemptionFee:fromP.fees.redemptionFee,mintFee:toP.fees.mintFee,routingFee:state.config.fees.routingFee});
 if(Math.max(quote.origin.averageSlippage,quote.destination.averageSlippage)>state.config.activity.maxSlippage)throw Error('Migration slippage limit exceeded.');
 from.backing+=quote.origin.backingDelta;from.shares-=quote.origin.shares;pos.shares-=quote.origin.shares;pos.principalBasis*=Math.max(0,1-div(quote.origin.shares,pos.shares+quote.origin.shares));
 to.backing+=quote.destination.backingDelta;to.shares+=quote.destination.shares;
 const destKey=key(toP.id,pos.restricted),dest=participant.positions[destKey]??={projectId:toP.id,restricted:pos.restricted,shares:0,principalBasis:0};
 dest.shares+=quote.destination.shares;dest.principalBasis+=quote.netMoved;participant.positions[destKey]=dest;
 recordFee(state.feeAccounts,{projectId:fromP.id,profile:participant.profileId,source,operation:'exit',gross:quote.origin.fee,priceUSD:state.priceUSD,allocations:state.config.fees.allocations});
 if(quote.routingFee)recordFee(state.feeAccounts,{projectId:'network',profile:participant.profileId,source,operation:'routing',gross:quote.routingFee,priceUSD:state.priceUSD,allocations:state.config.fees.allocations});
 recordFee(state.feeAccounts,{projectId:toP.id,profile:participant.profileId,source,operation:'entry',gross:quote.destination.fee,priceUSD:state.priceUSD,allocations:state.config.fees.allocations});
 state.transactions.push({eventId,day,participantId:participant.id,cohortId:participant.profileId,action:'migration',originProject:fromP.id,destinationProject:toP.id,requestedAmount:shares,unit:'receipts',executedAmount:quote.netMoved,sharesMinted:quote.destination.shares,sharesBurned:quote.origin.shares,gross:quote.origin.gross,net:quote.destination.net,feesCCLX:quote.totalFees,currency:'CCLX',provenance:source,status:'executed',rejectionReason:'',slippage:Math.max(quote.origin.averageSlippage,quote.destination.averageSlippage),capitalNew:0,capitalRecycled:quote.netMoved,cannibalizedCapital:quote.netMoved});
state.counters.migrations+=quote.netMoved;state.counters.actions++;chargeActionSubsidy(state);
 return quote;
}

function reject(state,day,participant,action,reason,eventId,requestedAmount=0,unit='CCLX'){
 state.transactions.push({eventId,day,participantId:participant?.id||'',cohortId:participant?.profileId||'',action,originProject:'',destinationProject:'',requestedAmount,unit,executedAmount:0,sharesMinted:0,sharesBurned:0,gross:0,net:0,feesCCLX:0,currency:'CCLX',provenance:participant?.restricted?'restricted':'unrestricted',status:'rejected',rejectionReason:reason,capitalNew:0,capitalRecycled:0});
 state.counters.rejected++;
}

function chooseAction(participant,state,r){
 const cfg=state.config,profile=profileById(participant.profileId,cfg.profiles),probs=cfg.activity;
 const hasPosition=Object.values(participant.positions).some(p=>p.shares>EPS),hasWallet=participant.wallet.unrestricted+participant.wallet.restricted>=cfg.activity.minOrderCCLX;
 let weights=[hasWallet?probs.depositProbability:0,hasPosition?probs.withdrawProbability:0,hasPosition?probs.migrationProbability*profile.migration:0,probs.holdProbability+profile.inertia*.05];
 return chooseWeighted(['deposit','withdraw','migration','hold'],weights,r);
}

function availableProjects(state,day,operation='deposit'){
 return state.projects.filter(p=>operationsForPhase(phaseForProject(p,day))[operation]);
}

function projectWeights(state,projects,participant,day){
 return projects.map(p=>{
  const vault=state.vaults[p.id],phase=phaseForProject(p,day),newness=Math.max(0,1-(day-(p.openDay??day))/120),cost=(p.fees.mintFee||0)+(vault?Math.max(0,spot(vault.curve,vault.shares)-spot(vault.curve,0))/Math.max(1,spot(vault.curve,0))*.02:0);
  const profile=profileById(participant.profileId,state.config.profiles);
  return Math.max(.001,p.attractiveness*p.quality*(phase==='open_for_deposits'?1.1:1)*(1+state.config.demand.noveltyBoost*newness)*Math.exp(-state.config.activity.feeElasticity*cost)*(1-profile.inertia*.2));
 });
}

function positionsList(participant){return Object.values(participant.positions).filter(p=>p.shares>EPS);}

function priceForDay(config,day){
 let p=config.priceSource.cclxUsd;
 if(config.pricePath?.mode==='synthetic'&&config.pricePath.shockDay!=null&&day>=config.pricePath.shockDay)p*=1+(config.pricePath.shockPct||0);
 return Math.max(EPS,p);
}

function protocolRetainedFeesCCLX(accounts){
 return sum(['treasury','reserve','lp','operations'].map(k=>accounts.CCLX[k]||0));
}

function chargeActionSubsidy(state){
 const subsidy=state.config.fees.subsidyPerActionCCLX||0;
 if(subsidy>0)state.costsUSD+=subsidy*state.priceUSD;
}

function projectDailyCostUSD(config,p){
 return (config.costs?.projectDailyUSD||0)>0?config.costs.projectDailyUSD:(p.costs?.dailyUSD||0);
}

export function reconcileCurveState(state){
 const wallet=sum(state.participants.map(p=>p.wallet.unrestricted+p.wallet.restricted));
 const reserves=sum(Object.values(state.vaults).map(v=>v.backing));
 const fees=state.feeAccounts.CCLX.netCollected;
 const total=wallet+reserves+fees;
 const expected=state.initialCCLX+state.externalInflowsCCLX-state.externalOutflowsCCLX;
 const receiptsResidual=sum(Object.values(state.vaults).map(v=>{
  const owned=sum(state.participants.flatMap(p=>positionsList(p).filter(x=>x.projectId===v.projectId).map(x=>x.shares)))+sum(Object.values(v.initialOwners));
  return Math.abs(owned-v.shares);
 }));
 return {wallet,reserves,fees,total,expected,residual:total-expected,receiptsResidual,solvent:Object.values(state.vaults).every(v=>v.backing>=-EPS&&v.shares>=-EPS),ok:Math.abs(total-expected)<=1e-5*Math.max(1,expected)&&receiptsResidual<=1e-5*Math.max(1,sum(Object.values(state.vaults).map(v=>v.shares)))};
}

function dailyMetrics(state,day){
 const phaseCounts={announced:0,open_for_deposits:0,funded:0,operating:0,matured:0,closed:0,defaulted:0};
 for(const p of state.projects){const ph=phaseForProject(p,day);if(phaseCounts[ph]!=null)phaseCounts[ph]++;}
 const active=state.participants.filter(p=>p.active).length,withPositions=state.participants.filter(p=>positionsList(p).length).length;
 const reserves=sum(Object.values(state.vaults).map(v=>v.backing)),fees=state.feeAccounts.CCLX.netCollected,reconcile=reconcileCurveState(state);
 const dayTx=state.transactions.filter(t=>t.day===day),slips=dayTx.map(t=>t.slippage).filter(Number.isFinite),rejected=dayTx.filter(t=>t.status==='rejected').length;
 const retained=protocolRetainedFeesCCLX(state.feeAccounts),retainedValue=retained*state.priceUSD;
 return {day,priceUSD:state.priceUSD,participants:state.participants.length,activeParticipants:active,depositors:withPositions,phaseCounts,reservesCCLX:reserves,walletsCCLX:reconcile.wallet,feesCCLX:fees,feesIndicativeUSD:state.feeAccounts.USD.indicativeAtCollection,protocolRetainedFeesCCLX:retained,protocolRetainedValueUSD:retainedValue,modeledCostsUSD:state.costsUSD,netProtocolResultUSD:retainedValue-state.costsUSD,externalInflowsCCLX:state.externalInflowsCCLX,capitalNewCCLX:state.counters.capitalNew,capitalRecycledCCLX:state.counters.migrations,depositVolumeCCLX:state.counters.deposits,withdrawalVolumeCCLX:state.counters.withdrawals,migrationVolumeCCLX:state.counters.migrations,actions:state.counters.actions,rejected,partial:state.counters.partial,p50Slippage:quantile(slips,.5),p95Slippage:quantile(slips,.95),accountingResidualCCLX:reconcile.residual,receiptResidual:reconcile.receiptsResidual};
}

export function runCurveSimulation(input=defaultCurveLabConfig(),{seed=input.seed,onProgress,signal,scenario={}}={}){
 const config=mergeCurveLabConfig(input,scenario),errors=validateCurveConfig(config);if(errors.length)throw Error(errors.join('; '));
 const r=rng(seed),projects=materializeCurveProjects(config),vaults=Object.fromEntries(projects.map(p=>[p.id,makeVault(p)])),participants=buildParticipants(config,r);
 const initialReserves=sum(Object.values(vaults).map(v=>v.backing));
 const state={config,projects,vaults,participants,feeAccounts:createFeeAccounts(),transactions:[],daily:[],priceUSD:config.priceSource.cclxUsd,initialCCLX:sum(participants.map(p=>p.wallet.unrestricted+p.wallet.restricted))+initialReserves,externalInflowsCCLX:0,externalOutflowsCCLX:0,costsUSD:0,counters:{actions:0,rejected:0,partial:0,deposits:0,withdrawals:0,migrations:0,capitalNew:0},eventSeq:0,warnings:[config.projectFinancing?.reason,'Baseline mode is collateral vault: receipts are reserve claims, not project-financing rights.'].filter(Boolean)};
 const dayOrder=()=>[...participants.keys()].sort(()=>r()-.5);
 for(let day=0;day<=config.horizonDays;day++){
  if(signal?.aborted)throw Error('cancelled');
  state.priceUSD=priceForDay(config,day);
  const added=addDailyParticipants(state,config,day,r);if(added.length)state.transactions.push({eventId:`e${++state.eventSeq}`,day,participantId:'network',cohortId:'new_entrants',action:'external_capital_inflow',originProject:'external',destinationProject:'wallets',requestedAmount:sum(added.map(p=>p.wallet.unrestricted+p.wallet.restricted)),unit:'CCLX',executedAmount:sum(added.map(p=>p.wallet.unrestricted+p.wallet.restricted)),gross:0,net:0,feesCCLX:0,currency:'CCLX',provenance:'external',status:'executed',rejectionReason:'',capitalNew:sum(added.map(p=>p.wallet.unrestricted+p.wallet.restricted)),capitalRecycled:0});
  state.costsUSD+=config.costs.networkDailyUSD+sum(projects.filter(p=>phaseForProject(p,day)!=='not_created'&&phaseForProject(p,day)!=='closed').map(p=>projectDailyCostUSD(config,p)));
  const activeProjects=availableProjects(state,day,'deposit');
  for(const idx of dayOrder()){
   const p=participants[idx];if(!p.active)continue;
   const costRelative=config.fees.defaultMintFee+config.fees.defaultRedemptionFee;
   if(!shouldAct(p,config,costRelative,r))continue;
   const eventId=`e${++state.eventSeq}`,action=chooseAction(p,state,r);
   try{
    if(action==='hold')continue;
    if(action==='deposit'){
     if(!activeProjects.length)throw Error('No project open for deposits.');
     const source=p.wallet.unrestricted>=p.wallet.restricted?'unrestricted':'restricted',wallet=p.wallet[source],amount=Math.min(wallet*config.activity.movableFraction*(.5+r()),config.capital.individualCapCCLX);
     if(amount<config.activity.minOrderCCLX)throw Error('Insufficient available wallet balance.');
     const prj=chooseWeighted(activeProjects,projectWeights(state,activeProjects,p,day),r);
     mutateDeposit(state,prj,state.vaults[prj.id],p,amount,source,day,eventId,true);
    }else if(action==='withdraw'){
     const pos=chooseWeighted(positionsList(p),positionsList(p).map(x=>x.shares),r),prj=projects.find(x=>x.id===pos.projectId);
     if(!operationsForPhase(phaseForProject(prj,day)).withdraw)throw Error('Origin project is not open for withdrawal.');
     const shares=pos.shares*config.activity.movableFraction*(.35+r()*.9);
     mutateWithdrawal(state,prj,state.vaults[prj.id],p,pos,shares,day,eventId);
    }else if(action==='migration'){
     const pos=chooseWeighted(positionsList(p),positionsList(p).map(x=>x.shares),r),fromP=projects.find(x=>x.id===pos.projectId),dests=availableProjects(state,day,'migrateIn').filter(x=>x.id!==fromP.id);
     if(!operationsForPhase(phaseForProject(fromP,day)).migrateOut||!dests.length)throw Error('No valid migration route.');
     const toP=chooseWeighted(dests,projectWeights(state,dests,p,day),r),shares=pos.shares*config.activity.movableFraction*(.35+r()*.9);
     mutateMigration(state,fromP,toP,p,pos,shares,day,eventId);
    }
   }catch(err){reject(state,day,p,action,err.message,eventId);}
  }
  if(config.activity.whaleExitDay!=null&&day===config.activity.whaleExitDay){
   for(const p of participants.filter(x=>x.profileId==='whale'))for(const pos of positionsList(p)){try{const prj=projects.find(x=>x.id===pos.projectId);mutateWithdrawal(state,prj,state.vaults[prj.id],p,pos,pos.shares*config.activity.whaleExitShare,day,`e${++state.eventSeq}`,'whale_exit');}catch(err){reject(state,day,p,'whale_exit',err.message,`e${++state.eventSeq}`);}}
  }
  const rec=reconcileCurveState(state);if(!rec.ok)throw Error(`Curve accounting residual ${rec.residual} / receipts ${rec.receiptsResidual}`);
  state.daily.push(dailyMetrics(state,day));
  if(onProgress&&(day%7===0||day===config.horizonDays))onProgress(day/config.horizonDays);
 }
 const result={schemaVersion:'curve-result/1.0',seed,config,projects:projects.map(p=>({id:p.id,name:p.name,origin:p.origin,phases:{createdDay:p.createdDay,openDay:p.openDay,fundraisingEndDay:p.fundraisingEndDay,operatingDay:p.operatingDay,maturityDay:p.maturityDay},floorBuffer:p.floorBuffer,fees:p.fees,curve:p.curve})),daily:state.daily,transactions:state.transactions,feeAccounts:summarizeFeeAccounts(state.feeAccounts),warnings:state.warnings,reconciliation:reconcileCurveState(state)};
 result.summary=summarizeCurveRun(result);
 return result;
}

export function summarizeCurveRun(result){
 const d=result.daily,last=d.at(-1)||{},avgReserve=div(sum(d.map(x=>x.reservesCCLX)),d.length),tx=result.transactions,executed=tx.filter(t=>t.status==='executed'),rejected=tx.filter(t=>t.status==='rejected');
 const slips=executed.map(t=>t.slippage).filter(Number.isFinite),activeAvg=div(sum(d.map(x=>x.activeParticipants)),d.length),months=Math.max(1,(last.day||0)/30);
 const fees=result.feeAccounts.CCLX.netCollected,projectFees=Object.entries(result.feeAccounts.byProject).map(([id,v])=>({id,net:v.net}));
 const topProject=Math.max(0,...projectFees.map(x=>x.net)),feeConcentration=div(topProject,fees);
 return {
  cumulativeFeesCCLX:fees,protocolRetainedFeesCCLX:last.protocolRetainedFeesCCLX||0,protocolRetainedValueUSD:last.protocolRetainedValueUSD||0,modeledCostsUSD:last.modeledCostsUSD||0,indicativeFeesUSD:result.feeAccounts.USD.indicativeAtCollection,netProtocolResultUSD:last.netProtocolResultUSD||0,
  averageDailyFeesCCLX:div(fees,d.length),averageMonthlyFeesCCLX:div(fees,months),takeRate:result.feeAccounts.realizedTakeRate,
  feesPerActiveParticipantCCLX:div(fees,activeAvg),reserveAverageCCLX:avgReserve,reserveFinalCCLX:last.reservesCCLX||0,
  actionFrequencyMonthly:div(executed.length,activeAvg*months),vaultTurnover:div((last.depositVolumeCCLX||0)+(last.withdrawalVolumeCCLX||0)+2*(last.migrationVolumeCCLX||0),avgReserve),
  migrationRate:div(last.migrationVolumeCCLX||0,avgReserve),rejectedDemandRate:div(rejected.length,tx.length),partialOrderRate:div(tx.filter(t=>t.status==='partial').length,tx.length),
  p50Slippage:quantile(slips,.5),p95WithdrawalSlippage:quantile(executed.filter(t=>t.action==='withdraw'||t.action==='migration'||t.action==='whale_exit').map(t=>t.slippage).filter(Number.isFinite),.95),
  p95RoundTripCost:quantile(executed.map(t=>div(t.feesCCLX,Math.max(1,t.executedAmount+t.feesCCLX))).filter(Number.isFinite),.95),
  participantsFinal:last.participants||0,activeParticipantsAverage:activeAvg,retention90d:div(result.daily.find(x=>x.day===90)?.depositors||last.depositors||0,result.config.participants.initial),
  capitalNewCCLX:last.capitalNewCCLX||0,capitalRecycledCCLX:last.capitalRecycledCCLX||0,feeConcentrationTopProject:feeConcentration,
  accountingResidualCCLX:result.reconciliation.residual,receiptResidual:result.reconciliation.receiptsResidual,valid:result.reconciliation.ok
 };
}

export function exportNetworkCSV(result){
 const h=['day','price_usd','participants','active_participants','announced','open','funded','operating','matured_closed','reserves_cclx','fees_cclx','protocol_retained_fees_cclx','fees_indicative_usd','protocol_retained_value_usd','modeled_costs_usd','net_protocol_result_usd','deposit_volume_cclx','withdrawal_volume_cclx','migration_volume_cclx','rejected','p95_slippage','accounting_residual_cclx'];
 return [h,...result.daily.map(r=>[r.day,r.priceUSD,r.participants,r.activeParticipants,r.phaseCounts.announced,r.phaseCounts.open_for_deposits,r.phaseCounts.funded,r.phaseCounts.operating,r.phaseCounts.matured+r.phaseCounts.closed,r.reservesCCLX,r.feesCCLX,r.protocolRetainedFeesCCLX,r.feesIndicativeUSD,r.protocolRetainedValueUSD,r.modeledCostsUSD,r.netProtocolResultUSD,r.depositVolumeCCLX,r.withdrawalVolumeCCLX,r.migrationVolumeCCLX,r.rejected,r.p95Slippage,r.accountingResidualCCLX])];
}

export function exportTransactionsCSV(result){
 const keys=['eventId','day','participantId','cohortId','action','originProject','destinationProject','requestedAmount','unit','executedAmount','sharesBurned','sharesMinted','gross','net','feesCCLX','currency','provenance','status','rejectionReason','capitalNew','capitalRecycled','cannibalizedCapital'];
 return [keys,...result.transactions.map(r=>keys.map(k=>r[k]??''))];
}

export function exportMarkdownReport(result){
 const s=result.summary;
 return `# CCLX Bonding Curve Lab Report

Generated from \`${result.config.schemaVersion}\` with seed \`${result.seed}\`.

This report is a local synthetic simulation. The condensed v5 inputs remain marked "Prepared for client discussion"; receipts are collateral-vault positions, not legal project-financing rights.

## Summary

- Fees collected: ${s.cumulativeFeesCCLX.toFixed(2)} CCLX
- Protocol retained fees: ${s.protocolRetainedFeesCCLX.toFixed(2)} CCLX
- Indicative fee value: $${s.indicativeFeesUSD.toFixed(2)}
- Modeled costs and subsidies: $${s.modeledCostsUSD.toFixed(2)}
- Net protocol result after modeled costs: $${s.netProtocolResultUSD.toFixed(2)}
- Average reserve: ${s.reserveAverageCCLX.toFixed(2)} CCLX
- Action frequency: ${s.actionFrequencyMonthly.toFixed(3)} actions / active participant / month
- Vault turnover, both migration legs included: ${s.vaultTurnover.toFixed(4)}
- Network migration rate, counted once: ${s.migrationRate.toFixed(4)}
- Rejected demand rate: ${(s.rejectedDemandRate*100).toFixed(2)}%
- P95 withdrawal slippage: ${(s.p95WithdrawalSlippage*100).toFixed(2)}%
- Accounting residual: ${s.accountingResidualCCLX.toExponential(3)} CCLX

## Limits

Project-financing mode is not enabled. External annualProtocolFees remain classified separately from curve trading fees unless the user chooses a non-overlapping consolidation rule. CCLX fee quantities are not USD cash until an explicit sale is executed.
`;
}
