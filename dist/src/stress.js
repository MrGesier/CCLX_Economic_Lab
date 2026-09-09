import {clone,clamp,div,sum,stats,quantile,unlockSchedule,monthlyBudget,allocateRewards,projectFeeIncome,cashWaterfall,validate,vestFraction,bridgeQuote} from './model.js';
import {makeMarket,reprice,guardedSell,guardedBuy,marketDepth,bidCash,refillBids} from './market.js';
export function rng(seed){let a=(seed>>>0)||1;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export function normal(r){const u=Math.max(r(),1e-12);return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*r());}
const cover=(depth,pressure)=>pressure>1e-9?depth/pressure:null;
const bounded=x=>Math.max(1e-8,Math.min(1e6,x));
const metric=a=>stats(a.map(v=>Number.isFinite(v)?v:0));
function withdrawBids(m,rate){const w=clamp(rate,0,1),before=bidCash(m);for(const b of m.bids)b.cash*=1-w;return before-bidCash(m);}
function projectStep(c,s,month,r,common,failed,reserves,riskReserve){
 let fees=0,losses=0,uncovered=0,real=0,liq=0,ops=0,defaults=0;const results=[];
 for(let i=0;i<c.projects.length;i++){
  const p=c.projects[i],z=s.projectCorrelation*common+Math.sqrt(Math.max(0,1-s.projectCorrelation**2))*normal(r);
  let income=failed.has(i)?0:projectFeeIncome(p,month-1,{stress:{...c.stress,revenueGrowth:s.revenueGrowth}},Math.exp(s.revenueVol*z/Math.sqrt(12)-s.revenueVol*s.revenueVol/24));
  const hazard=clamp((1-Math.pow(1-p.defaultPD,1/12))*s.projectDefaultMultiplier*Math.exp(.35*(-common)-.06125),0,1);
  let loss=0;
  if(!failed.has(i)&&r()<hazard){failed.add(i);defaults++;loss=p.exposure*p.lgd;const projectCover=Math.min(reserves[i],loss);reserves[i]-=projectCover;let residual=loss-projectCover;const riskCover=Math.min(riskReserve,residual);riskReserve-=riskCover;residual-=riskCover;uncovered+=residual;income=0;}
  const w=cashWaterfall(c,income);fees+=income;real+=w.rewards;liq+=w.liquidity;ops+=w.operations+w.unallocated;riskReserve+=w.risk;losses+=loss;
  results.push({id:p.id,netFees:income,realYield:w.rewards,loss,failed:failed.has(i)});
 }
 return {fees,losses,uncovered,real,liq,ops,defaults,riskReserve,results};
}
/** Independent finite arbitrage inventory. Cash returned on sales is not a new protocol funding source. */
function arbitrage(m,price,account){
 const q=reprice(m,price,{cash:account.cash,tokens:account.tokens});
 account.cash=Math.max(0,account.cash-q.quoteDelta);
 account.tokens=Math.max(0,account.tokens-q.tokenDelta);
 account.cashUsed+=q.cashUsed;account.tokensUsed+=q.tokensUsed;
 return q;
}
function distribute(total,weights,caps){
 const out=weights.map(()=>0);let left=Math.max(0,total);
 for(let pass=0;pass<weights.length+1&&left>1e-7;pass++){
  const active=weights.map((w,i)=>caps[i]-out[i]>1e-7?i:-1).filter(i=>i>=0),wSum=sum(active.map(i=>weights[i]));if(!active.length||wSum<=0)break;
  let used=0;for(const i of active){const x=Math.min(caps[i]-out[i],left*weights[i]/wSum);out[i]+=x;used+=x;}left-=used;
 }
 return out;
}
export function simulatePath(c,seed=c.stress.seed,changes={}){
 const s={...c.stress,...changes},r=rng(seed),schedule=unlockSchedule(c,s.months),m=makeMarket(c);
 let price=c.launchPrice,external=price,peak=price,liquidityReserve=s.liquidityReserve,riskReserve=s.reserveRisk,operating=s.cashBuffer,queue=0,buyQueue=0,emitted=0,emittedFree=0,emittedRestricted=0,defaults=0,uncoveredLoss=0,realPaid=0,actualSales=0,externalTopups=0,liquidityConsumed=0,mmWithdrawn=0;
 const arb={cash:s.externalArbCash,tokens:s.externalArbTokens,cashUsed:0,tokensUsed:0};const reserves=c.projects.map(p=>p.reserveUSD),failed=new Set(),rows=[];
 const idio=Math.sqrt(Math.max(0,s.annualVol*s.annualVol-(s.marketFactorVol*s.marketBeta)**2));
 const cap=bridgeQuote(c).cap;
 for(let month=1;month<=s.months;month++){
  const z=normal(r),z2=normal(r),dt=1/12;
  let logReturn=(s.annualDrift-.5*s.annualVol**2)*dt+(s.marketBeta*s.marketFactorVol*z+idio*z2)*Math.sqrt(dt);
  if(r()<s.jumpProbability)logReturn+=s.jumpMean+s.jumpVol*normal(r);
  if(month===s.shockMonth&&s.shockSize!==0)logReturn+=Math.log(Math.max(.001,1+s.shockSize));
  external=bounded(external*Math.exp(logReturn));arbitrage(m,external,arb);price=external;
  const pstep=projectStep(c,s,month,r,z,failed,reserves,riskReserve);riskReserve=pstep.riskReserve;liquidityReserve+=pstep.liq;operating+=pstep.ops;defaults+=pstep.defaults;uncoveredLoss+=pstep.uncovered;realPaid+=pstep.real;
  const release=schedule[month],rewardCeiling=monthlyBudget(c,month-1);
  const bridgeIssued=cap*(s.bridgeTakeupOverride??c.bridge.assumedTakeup);
  const restrictedPrincipal=bridgeIssued*vestFraction(month,c.bridge.cliff,c.bridge.linear);
  const weights=c.projects.map(p=>p.collateral*p.quality*p.bootstrapWeight),caps=c.projects.map(p=>p.capacity);
  const restrictedTarget=Math.min(restrictedPrincipal+emittedRestricted,sum(caps));
  const restrictedLocks=distribute(restrictedTarget,weights,caps);
  const remainingCaps=caps.map((v,i)=>v-restrictedLocks[i]);
  const freeSupply=Math.max(0,release.liquid+emittedFree);
  const freeTarget=Math.min(sum(remainingCaps),freeSupply,freeSupply*s.stakingParticipation);
  const freeLocks=distribute(freeTarget,weights,remainingCaps);
  const locks=freeLocks.map((v,i)=>v+restrictedLocks[i]);
  const reward=allocateRewards(c,month-1,locks);
  const freeReward=sum(reward.byProject.map((v,i)=>v*div(freeLocks[i],locks[i])));
  const restrictedReward=reward.distributed-freeReward;
  emitted+=reward.distributed;emittedFree+=freeReward;emittedRestricted+=restrictedReward;
  const staked=sum(locks),freeStaked=sum(freeLocks),activeFloat=Math.max(0,release.liquid+emittedFree-freeStaked),mmInventory=Math.min(c.liquidity.cexTokens+c.liquidity.dexTokens,c.allocations.find(a=>a.id==='liquidity').tokens);
  const totalCirculating=release.liquid+emittedFree+mmInventory;
  const byBucket={},unlockScale=div(s.unlockSellRate,.35);let unlockSales=0;
  for(const b of c.rounds){const q=release.deltas[b.id]*clamp(b.sellRate*unlockScale,0,1);byBucket[b.id]=q;unlockSales+=q;}
  for(const b of [{id:'team-liquid',rate:.25},{id:'ecosystem',rate:.15},{id:'foundation',rate:.1},{id:'advisors',rate:.3}]){const q=release.deltas[b.id]*clamp(b.rate*unlockScale,0,1);byBucket[b.id]=q;unlockSales+=q;}
  byBucket.bridge=0;byBucket.rewards=0;byBucket.liquidity=0;byBucket.treasury=0;
  const scheduledUnlockDemand=unlockSales;
  const freeForNewSales=Math.max(0,activeFloat-queue);
  unlockSales=Math.min(unlockSales,freeForNewSales);
  const rewardSales=Math.min(freeReward*s.rewardSellRate,Math.max(0,freeForNewSales-unlockSales));
  const organicSell=Math.max(0,freeForNewSales-unlockSales-rewardSales)*s.organicSellRate;
  const newSales=unlockSales+rewardSales+organicSell,buyDemand=activeFloat*price*s.organicBuyRate,previousQueue=queue,previousBuyQueue=buyQueue;
  mmWithdrawn+=withdrawBids(m,Math.min(1,s.mmWithdrawal+(month===s.shockMonth?s.mmShock:0)));
  const depthPre=marketDepth(m,200).total,unlockPressure=unlockSales*price,totalPressure=(newSales+previousQueue)*price,coverage=cover(depthPre,totalPressure),unlockCoverage=cover(depthPre,unlockPressure);
  const buy=guardedBuy(m,buyDemand+buyQueue,s.maxExecutionSlippage,true);buyQueue=buy.unfilled*(1-s.queueDecay);
  const sell=guardedSell(m,newSales+queue,s.maxExecutionSlippage,true);queue=sell.unfilled*(1-s.queueDecay);actualSales+=sell.filled;
  const netUSD=sell.quote-buy.spent,impact=clamp(s.impactFeedback*netUSD/Math.max(1,c.liquidity.budget),-.7,.7);
  external=bounded(external*Math.exp(-impact));arbitrage(m,external,arb);price=external;peak=Math.max(peak,price);
  liquidityReserve+=s.liquidityTopup;externalTopups+=s.liquidityTopup;
  const desired=Math.max(0,c.liquidity.cexQuote-bidCash(m))*s.mmReplenishment,replenish=Math.min(desired,liquidityReserve);
  refillBids(m,replenish);liquidityReserve-=replenish;liquidityConsumed+=replenish;
  const depthPost=marketDepth(m,200).total,drawdown=1-price/peak,unfundedRefill=Math.max(0,desired-replenish);
  rows.push({month,price,external,drawdown,depth:depthPre,depthPost,coverage,unlockCoverage,unlockPressure,totalPressure,unlockSales,scheduledUnlockDemand,byBucket,rewardSales,organicSell,emitted:reward.distributed,freeReward,restrictedReward,rewardCeiling,rewardUnused:reward.unused,cumulativeEmitted:emitted,cumulativeRestrictedRewards:emittedRestricted,unlocked:release.liquidDelta,restrictedReleased:restrictedPrincipal,liquidCirculating:totalCirculating,publicCirculating:release.liquid+emittedFree,mmInventory,activeFloat,staked,freeStaked,restrictedStaked:sum(restrictedLocks),sellDemand:newSales+previousQueue,executedSales:sell.filled,unfilled:sell.unfilled,queue,buyDemand:buyDemand+previousBuyQueue,buyExecuted:buy.spent,buyQueue,slippage:sell.slippage,buySlippage:buy.slippage,netUSD,impact,bidCash:bidCash(m),dexQuote:m.y,dexSpot:m.x>0?m.y/m.x:0,liquidityReserve,riskReserve,operating,projectCash:sum(reserves),realYield:pstep.real,totalFees:pstep.fees,losses:pstep.losses,uncoveredLoss:pstep.uncovered,defaults,externalTopups,liquidityConsumed,unfundedRefill,mmWithdrawn,arbCash:arb.cash,arbTokens:arb.tokens,arbCashUsed:arb.cashUsed,arbTokensUsed:arb.tokensUsed,projectResults:pstep.results});
 }
 return {seed,rows,summary:{terminalPrice:price,maxDrawdown:Math.max(0,...rows.map(x=>x.drawdown)),minDepth:Math.min(...rows.map(x=>x.depth)),minCoverage:Math.min(...rows.map(x=>x.coverage??1e6)),minUnlockCoverage:Math.min(...rows.map(x=>x.unlockCoverage??1e6)),minLiquidityReserve:Math.min(...rows.map(x=>x.liquidityReserve)),minRiskReserve:Math.min(...rows.map(x=>x.riskReserve)),defaults,totalRealYield:realPaid,totalRewards:emitted,totalRestrictedRewards:emittedRestricted,totalLosses:sum(rows.map(x=>x.losses)),uncoveredLoss,worstSlippage:Math.max(0,...rows.map(x=>x.slippage)),maxQueue:Math.max(0,...rows.map(x=>x.queue)),finalQueue:queue,liquidityConsumed,externalTopups,mmWithdrawn,actualSales,arbCashUsed:arb.cashUsed,depthBreach:rows.some(x=>x.coverage!==null&&x.coverage<c.liquidity.coverageTarget),reserveExhausted:rows.some(x=>x.unfundedRefill>1e-6),maxUnfundedRefill:Math.max(0,...rows.map(x=>x.unfundedRefill))}};
}
export function painZones(c,paths,threshold=c.liquidity.coverageTarget){return Array.from({length:paths[0].rows.length},(_,i)=>{const rows=paths.map(p=>p.rows[i]),coverage=rows.map(x=>x.coverage??1e6),unlockCoverage=rows.map(x=>x.unlockCoverage??1e6),fail=rows.filter(x=>x.coverage!==null&&x.coverage<threshold).length/rows.length,unlockFail=rows.filter(x=>x.unlockCoverage!==null&&x.unlockCoverage<threshold).length/rows.length,queueFail=rows.filter(x=>x.queue>1).length/rows.length;return {month:i+1,coverage:metric(coverage.map(x=>Math.min(10,x))),unlockCoverage:metric(unlockCoverage.map(x=>Math.min(10,x))),depth:metric(rows.map(x=>x.depth)),unlockSalesUSD:metric(rows.map(x=>x.unlockPressure)),totalPressureUSD:metric(rows.map(x=>x.totalPressure)),price:metric(rows.map(x=>x.price)),queue:metric(rows.map(x=>x.queue)),failProbability:fail,unlockFailProbability:unlockFail,queueProbability:queueFail,byBucket:rows[0].byBucket,zone:fail>=.5?'Critical':fail>=.2?'Watch':'Normal'};});}
export function aggregateStress(c,paths,changes={}){const s={...c.stress,...changes},zones=painZones(c,paths,c.liquidity.coverageTarget),summaries=paths.map(p=>p.summary),terminalReturns=summaries.map(x=>x.terminalPrice/c.launchPrice-1),tail=quantile(terminalReturns,.05);return {meta:{paths:paths.length,months:s.months,seed:s.seed,model:'Synthetic correlated GBM + jumps + finite external arbitrage inventory + cash-limited market execution. Monthly, not tick-level; no calibrated live market data.'},series:zones,pathSummaries:summaries,distribution:{terminalPrices:summaries.map(x=>x.terminalPrice),terminalReturns,var95:-tail,expectedShortfall95:-div(sum(terminalReturns.filter(x=>x<=tail)),terminalReturns.filter(x=>x<=tail).length)},summary:{terminalPrice:metric(summaries.map(x=>x.terminalPrice)),maxDrawdown:metric(summaries.map(x=>x.maxDrawdown)),minDepth:metric(summaries.map(x=>x.minDepth)),minCoverage:metric(summaries.map(x=>x.minCoverage)),liquidityReserve:metric(summaries.map(x=>x.minLiquidityReserve)),riskReserve:metric(summaries.map(x=>x.minRiskReserve)),realYield:metric(summaries.map(x=>x.totalRealYield)),rewards:metric(summaries.map(x=>x.totalRewards)),restrictedRewards:metric(summaries.map(x=>x.totalRestrictedRewards)),defaults:metric(summaries.map(x=>x.defaults)),uncoveredLoss:metric(summaries.map(x=>x.uncoveredLoss)),worstSlippage:metric(summaries.map(x=>x.worstSlippage)),maxQueue:metric(summaries.map(x=>x.maxQueue)),liquidityConsumed:metric(summaries.map(x=>x.liquidityConsumed)),lossProbability:summaries.filter(x=>x.terminalPrice<c.launchPrice).length/paths.length,depthBreachProbability:summaries.filter(x=>x.depthBreach).length/paths.length,reserveExhaustionProbability:summaries.filter(x=>x.reserveExhausted).length/paths.length},painZones:zones.filter(x=>x.failProbability>=.2),sample:paths[0].rows};}
export function runStress(c,changes={},onProgress){const cfg=clone(c),s={...cfg.stress,...changes};cfg.stress=s;const errors=validate(cfg);if(errors.length)throw Error(errors.join('; '));const paths=[];for(let i=0;i<s.paths;i++){paths.push(simulatePath(cfg,(s.seed+i*2654435761)>>>0));if(onProgress&&(i%10===0||i===s.paths-1))onProgress((i+1)/s.paths);}return aggregateStress(cfg,paths);}
export const SCENARIOS=[
{id:'base',name:'Base case',description:'Current editable assumptions.',changes:{}},
{id:'bear',name:'Bear market',description:'Negative drift, volatility and stronger selling.',changes:{annualDrift:-.35,annualVol:1.15,marketFactorVol:.7,organicSellRate:.006,unlockSellRate:.6,rewardSellRate:.8,mmShock:.25,shockSize:-.25}},
{id:'unlock',name:'Unlock cliff',description:'Concentrated unlock selling and a simultaneous liquidity shock.',changes:{unlockSellRate:.9,mmShock:.55,shockMonth:12,shockSize:-.4,liquidityTopup:0}},
{id:'revenue',name:'Project underperformance',description:'Revenue contraction, correlated defaults and weaker demand.',changes:{revenueGrowth:-.15,revenueVol:.55,projectDefaultMultiplier:3,organicBuyRate:.0015,annualDrift:-.2}},
{id:'liquidity',name:'MM withdrawal',description:'CEX bid withdrawal, no replenishment and finite DEX liquidity.',changes:{mmShock:.8,mmWithdrawal:.025,mmReplenishment:0,liquidityTopup:0}},
{id:'bull',name:'Growth case',description:'Higher adoption with lower unlock selling and improving revenues.',changes:{annualDrift:.35,organicBuyRate:.006,unlockSellRate:.2,revenueGrowth:.2,annualVol:.65}},
{id:'combined',name:'Combined crisis',description:'Bear market, project defaults, high unlock sales and MM withdrawal.',changes:{annualDrift:-.4,annualVol:1.2,marketFactorVol:.75,unlockSellRate:.9,rewardSellRate:.9,mmShock:.7,mmWithdrawal:.02,shockSize:-.4,projectDefaultMultiplier:4,revenueGrowth:-.2,organicBuyRate:.001,mmReplenishment:.05}}
];
