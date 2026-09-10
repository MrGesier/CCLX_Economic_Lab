/** CCLX Economic Lab — synthetic, editable working assumptions. No live assets. */
export const VERSION='1.1.0';
export const clone=x=>structuredClone(x);
export const sum=a=>a.reduce((s,x)=>s+x,0);
export const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export const div=(a,b)=>b>0?a/b:0;
export const quantile=(a,p)=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),i=(s.length-1)*p,l=Math.floor(i),h=Math.ceil(i);return s[l]+(s[h]-s[l])*(i-l);};
export const stats=a=>({p05:quantile(a,.05),p50:quantile(a,.5),p95:quantile(a,.95),mean:div(sum(a),a.length)});
export const fmt=(n,d=0)=>Number(n).toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
export const usd=(n,d=0)=>'$'+fmt(n,d);
export const pct=(n,d=1)=>fmt(n*100,d)+'%';
export const ROUND_DEFS=[
{id:'strategic',name:'Strategic',tokens:6e6,price:.075,cliff:12,linear:30,tge:0,sellRate:.35},
{id:'private1',name:'Private 1',tokens:8e6,price:.11,cliff:9,linear:27,tge:0,sellRate:.35},
{id:'private2',name:'Private 2',tokens:10e6,price:.15,cliff:6,linear:18,tge:0,sellRate:.35},
{id:'private3',name:'Private 3',tokens:10e6,price:.21,cliff:3,linear:15,tge:0,sellRate:.35},
{id:'public',name:'Public sale',tokens:10e6,price:.275,cliff:0,linear:6,tge:.5,sellRate:.25}
];
export const REWARD_BUDGET=[5e6,4.5e6,4e6,3.5e6,3e6,2.5e6,2e6,1.5e6];
export const ALLOCATIONS=[
{id:'sales',name:'Token sales',tokens:44e6,color:'#5875b5'},
{id:'team',name:'Team & founders',tokens:36e6,color:'#a47d5b'},
{id:'ecosystem',name:'Ecosystem / projects',tokens:32e6,color:'#658f7b'},
{id:'rewards',name:'Staking & quality rewards',tokens:26e6,color:'#8d7cae'},
{id:'treasury',name:'Treasury & risk',tokens:26e6,color:'#78909a'},
{id:'liquidity',name:'Liquidity / MM',tokens:16e6,color:'#5b9a9a'},
{id:'foundation',name:'Foundation / community',tokens:12e6,color:'#b19967'},
{id:'advisors',name:'Advisors / partners',tokens:8e6,color:'#a1a7ad'}
];
export const PROJECTS=[
{id:'forest',name:'Forest Restoration A',type:'Carbon Forward',sector:'Nature',location:'Synthetic / Central Africa',status:'Mock operating',stage:1,capital:4250000,annualRevenue:320000,annualProtocolFees:95000,annualCosts:22000,exposure:425000,reserveUSD:240000,collateral:1800000,curveA:.9,curveB:1.2e-7,curveFee:.002,defaultPD:.06,lgd:.55,quality:1.05,bootstrapWeight:.95,capacity:5e6,milestones:['Baseline validated','Execution independently verified','Delivery verified'],description:'Fictitious project economics. No claim about an actual CCL project or its environmental performance.'},
{id:'solar',name:'Solar Water Access',type:'Green Debt',sector:'Infrastructure',location:'Synthetic / East Africa',status:'Mock operating',stage:2,capital:2800000,annualRevenue:410000,annualProtocolFees:128000,annualCosts:31000,exposure:280000,reserveUSD:185000,collateral:2600000,curveA:1.0,curveB:8e-8,curveFee:.002,defaultPD:.045,lgd:.4,quality:1.1,bootstrapWeight:1.1,capacity:6e6,milestones:['Contracts approved','Commissioning verified','Debt service verified'],description:'Fictitious debt-financed infrastructure. Bondholder cash flows are separate from CCLX pool rewards.'},
{id:'mangrove',name:'Mangrove Delta',type:'Carbon Forward',sector:'Blue carbon',location:'Synthetic / Southeast Asia',status:'Mock early stage',stage:0,capital:3100000,annualRevenue:170000,annualProtocolFees:45000,annualCosts:18000,exposure:310000,reserveUSD:120000,collateral:1100000,curveA:.8,curveB:1.5e-7,curveFee:.002,defaultPD:.09,lgd:.65,quality:.9,bootstrapWeight:1.25,capacity:4e6,milestones:['Project approved','Restoration verified','Environmental delivery verified'],description:'Fictitious early-stage project with explicitly uncertain revenue and delivery.'}
];
export const SOURCES=[
{name:'CCLX Token Condensed v4/v5',role:'Working proposal: fixed 200M supply, five sale rounds, 26M reward budget and 18% Team & Founders allocation.'},
{name:'Workshop — 2 September 2026',role:'CO2BIT conversion restricted to project collateral; Green Bonds deliver contractual debt returns and reporting; CCLX rewards form part of the proposed model.'},
{name:'CCLX integrated architecture V8',role:'Separate project financing contracts, treasury accounting, MRV and project-specific pools.'},
{name:'Economic Lab v1',role:'All prices, market depth, revenue, default probabilities, APR targets, trading behaviour and stress parameters are synthetic assumptions, not observed market data.'}
];
export function defaults(){return {
 supply:200e6,launchPrice:.275,rounds:clone(ROUND_DEFS),allocations:clone(ALLOCATIONS),rewardBudget:clone(REWARD_BUDGET),
 bridge:{internalCap:12e6,valuationCap:3.3e6,eligibleSupply:900e6,registered:900e6,claimed:0,referencePrice:.275,cliff:12,linear:24,claimWindow:180,perEntityCap:.15,assumedTakeup:.75,frozen:true},
 liquidity:{budget:1.5e6,cexQuote:900000,dexQuote:600000,cexTokens:8e6-600000/.275,dexTokens:600000/.275,cexDepth:[90000,190000,350000,480000,600000,780000,900000],levels:[25,50,100,150,200,500,1000],spreadBps:20,dexFee:.003,cexFee:.001,depthTarget:600000,tradeTarget:100000,slippageTarget:.01,coverageTarget:1.2},
 stress:{months:36,paths:300,seed:20260907,annualDrift:.28,annualVol:.32,marketFactorVol:.22,marketBeta:.65,jumpProbability:.006,jumpMean:-.09,jumpVol:.06,shockMonth:12,shockSize:0,revenueGrowth:.12,revenueVol:.18,revenueMarketCorrelation:.2,projectCorrelation:.25,projectDefaultMultiplier:.75,organicSellRate:.0012,organicBuyRate:.008,unlockSellRate:.10,rewardSellRate:.20,mmShock:0,mmWithdrawal:0,mmReplenishment:.55,liquidityReserve:900000,liquidityTopup:12000,externalArbCash:1000000,externalArbTokens:1200000,reserveRisk:500000,cashBuffer:250000,impactFeedback:.12,maxExecutionSlippage:.2,queueDecay:.1,stakingParticipation:.45,bootstrapTargetAPR:.08,collateralHaircut:.5,feeToRewards:.3,feeToRisk:.15,feeToLiquidity:.1,feeToOps:.45,borrowEnabled:false,borrowLTV:.25,liquidationLTV:.55,oracleDeviation:.1},
 projects:clone(PROJECTS),mock:{wallet:{usd:25000,liquid:0,restricted:0,unvestedRestricted:0,rewardLiquid:0,restrictedRewards:0,legacy:150000,positions:[]},day:0}
};}
export const initialFloat=c=>sum(c.rounds.map(r=>r.tokens*r.tge))+allocation(c,'liquidity')*.5+2e6+1e6;
export const allocation=(c,id)=>c.allocations.find(a=>a.id===id)?.tokens??0;
export function validate(c){const e=[];const n=(v,k,min=0,max=Infinity)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)e.push(`${k}: finite number required in [${min}, ${max}]`);};
 n(c.supply,'supply',1);n(c.launchPrice,'launchPrice',1e-8);
 if(Math.abs(sum(c.allocations.map(a=>a.tokens))-c.supply)>1e-4)e.push('Allocations must sum to maximum supply.');
 if(Math.abs(sum(c.rounds.map(r=>r.tokens))-allocation(c,'sales'))>1e-4)e.push('Sale rounds must reconcile to the sales allocation.');
 if(Math.abs(sum(c.rewardBudget)-allocation(c,'rewards'))>1e-4)e.push('Reward budget must reconcile to the rewards allocation.');
 const b=c.bridge,l=c.liquidity,s=c.stress;
 for(const k of ['internalCap','valuationCap','eligibleSupply','registered','claimed','referencePrice','cliff','linear','claimWindow','assumedTakeup'])n(b[k],'bridge.'+k,k==='referencePrice'?1e-8:0);
 n(b.perEntityCap,'bridge.perEntityCap',0,1);n(b.assumedTakeup,'bridge.assumedTakeup',0,1);
 if(b.internalCap>allocation(c,'team'))e.push('Internal bridge capacity exceeds Team & Founders allocation.');
 if(b.eligibleSupply<=0||b.registered>b.eligibleSupply)e.push('Invalid eligible or registered legacy supply.');
 if(b.valuationCap/b.referencePrice>b.internalCap+1e-6)e.push('Bridge valuation-implied amount exceeds internal capacity.');
 if(b.claimed>Math.min(b.internalCap,b.valuationCap/b.referencePrice))e.push('Existing bridge claims exceed the cap.');
 if(b.internalCap>0&&b.cliff+b.linear<=0)e.push('Restricted conversion requires a vesting schedule.');
 for(const r of c.rounds){for(const k of ['tokens','price','cliff','linear'])n(r[k],r.id+'.'+k,k==='price'?1e-8:0);n(r.tge,r.id+'.tge',0,1);n(r.sellRate,r.id+'.sellRate',0,1);}
 for(const k of ['budget','cexQuote','dexQuote','cexTokens','dexTokens','depthTarget','tradeTarget'])n(l[k],'liquidity.'+k);
 for(const k of ['cexFee','dexFee','slippageTarget','coverageTarget'])n(l[k],'liquidity.'+k,0,k.includes('Fee')||k==='slippageTarget'?0.999:1e6);
 if(l.cexQuote+l.dexQuote>l.budget+1e-6)e.push('CEX and DEX quote funding exceeds the liquidity budget.');
 if(l.dexQuote<=0||l.dexTokens<=0)e.push('DEX reserves must be positive.');
 if(l.cexTokens+l.dexTokens>allocation(c,'liquidity')+1e-6)e.push('MM token inventory exceeds its allocation.');
 if(l.levels.length!==l.cexDepth.length||l.levels.some((v,i)=>v<=0||v>=10000||(i&&v<=l.levels[i-1]))||l.cexDepth.some((v,i)=>v<0||(i&&v<l.cexDepth[i-1]))||l.cexDepth.at(-1)>l.cexQuote+1e-6)e.push('CEX cumulative depth ladder is invalid or unfunded.');
 for(const k of ['months','paths'])n(s[k],'stress.'+k,1,k==='months'?120:3000);
 for(const k of ['annualDrift','annualVol','marketFactorVol','marketBeta','jumpProbability','jumpVol','revenueGrowth','revenueVol','revenueMarketCorrelation','projectCorrelation','projectDefaultMultiplier','organicSellRate','organicBuyRate','unlockSellRate','rewardSellRate','mmShock','mmWithdrawal','mmReplenishment','liquidityReserve','liquidityTopup','externalArbCash','externalArbTokens','reserveRisk','cashBuffer','impactFeedback','maxExecutionSlippage','queueDecay','stakingParticipation','bootstrapTargetAPR','collateralHaircut','feeToRewards','feeToRisk','feeToLiquidity','feeToOps','borrowLTV','liquidationLTV','oracleDeviation'])n(s[k],'stress.'+k,['annualDrift','revenueGrowth','revenueMarketCorrelation','projectCorrelation'].includes(k)?-5:0);
 for(const k of ['jumpProbability','marketBeta','revenueMarketCorrelation','projectCorrelation','unlockSellRate','rewardSellRate','mmShock','mmWithdrawal','mmReplenishment','maxExecutionSlippage','queueDecay','stakingParticipation','collateralHaircut','feeToRewards','feeToRisk','feeToLiquidity','feeToOps','borrowLTV','liquidationLTV','oracleDeviation'])if(Math.abs(s[k])>1)e.push('stress.'+k+' must be within the probability/rate bounds.');
 if(sum(['feeToRewards','feeToRisk','feeToLiquidity','feeToOps'].map(k=>s[k]))>1+1e-9)e.push('Real cash waterfall exceeds 100%.');
 if(s.borrowLTV>=s.liquidationLTV||s.liquidationLTV>1)e.push('Borrow LTV must be below liquidation LTV <= 100%.');
 if(!Number.isInteger(s.months)||!Number.isInteger(s.paths)||!Number.isInteger(s.seed))e.push('Simulation horizon, path count and seed must be integers.');
 if(s.marketBeta*s.marketFactorVol>s.annualVol+1e-9)e.push('Common-factor volatility exceeds total asset volatility.');
 const ids=new Set();for(const p of c.projects){if(ids.has(p.id))e.push('Duplicate project ID.');ids.add(p.id);for(const k of ['annualProtocolFees','annualCosts','exposure','reserveUSD','collateral','curveA','curveB','curveFee','defaultPD','lgd','quality','bootstrapWeight','capacity'])n(p[k],p.id+'.'+k);if(p.curveA<=0||p.curveFee>=1||p.defaultPD>1||p.lgd>1)e.push(p.id+': invalid curve or credit-risk parameters.');if(p.annualCosts>p.annualProtocolFees)e.push(p.id+': costs exceed recurring protocol fees; no positive baseline real yield.');if(p.collateral>p.capacity)e.push(p.id+': initial collateral exceeds capacity.');}
 return e;
}
export const fundingTable=c=>c.rounds.map(r=>({...r,fdv:r.price*c.supply,raised:r.price*r.tokens,share:r.tokens/c.supply,discount:1-r.price/c.rounds.at(-1).price}));
export function vestFraction(month,cliff,linear,tge=0){if(month<0)return 0;if(month===0)return tge;if(month<=cliff)return tge;return clamp(tge+(1-tge)*(linear>0?(month-cliff)/linear:1),0,1);}
export function rewardCumulative(month,budget=REWARD_BUDGET){return sum(budget.map((v,y)=>v*clamp((month-y*12)/12,0,1)));}
export function buckets(c){return [...c.rounds.map(r=>({...r,kind:'liquid',category:'sales'})),
{id:'team-liquid',name:'Team & founders (ordinary)',tokens:allocation(c,'team')-c.bridge.internalCap,cliff:12,linear:36,tge:0,sellRate:.25,kind:'liquid'},
{id:'bridge',name:'CO2BIT restricted conversion',tokens:c.bridge.internalCap,cliff:c.bridge.cliff,linear:c.bridge.linear,tge:0,sellRate:0,kind:'restricted'},
{id:'ecosystem',name:'Ecosystem',tokens:allocation(c,'ecosystem'),cliff:0,linear:48,tge:2e6/allocation(c,'ecosystem'),sellRate:.15,kind:'liquid'},
{id:'rewards',name:'Reward ceiling',tokens:allocation(c,'rewards'),kind:'rewards',sellRate:0},
{id:'treasury',name:'Treasury (governed)',tokens:allocation(c,'treasury'),kind:'governed',tge:0,sellRate:0},
{id:'liquidity',name:'Liquidity / MM',tokens:allocation(c,'liquidity'),kind:'governed',tge:.5,sellRate:0},
{id:'foundation',name:'Foundation / community',tokens:allocation(c,'foundation'),cliff:0,linear:36,tge:1e6/allocation(c,'foundation'),sellRate:.1,kind:'liquid'},
{id:'advisors',name:'Advisors / partners',tokens:allocation(c,'advisors'),cliff:6,linear:24,tge:0,sellRate:.3,kind:'liquid'}];}
export function unlockSchedule(c,months=60){const bs=buckets(c),rows=[];let previous={};for(let m=0;m<=months;m++){const byBucket={},deltas={};let liquid=0,restricted=0,governed=0,rewardCeiling=0;for(const b of bs){let v=0;if(b.kind==='liquid'||b.kind==='restricted')v=b.tokens*vestFraction(m,b.cliff,b.linear,b.tge);if(b.kind==='governed')v=b.tokens*b.tge;if(b.kind==='rewards')v=rewardCumulative(m,c.rewardBudget);byBucket[b.id]=v;deltas[b.id]=Math.max(0,v-(previous[b.id]||0));if(b.kind==='liquid')liquid+=v;if(b.kind==='restricted')restricted+=v;if(b.kind==='governed')governed+=v;if(b.kind==='rewards')rewardCeiling+=v;}rows.push({month:m,liquid,restricted,governed,rewardCeiling,cumulative:liquid+governed,byBucket,deltas,liquidDelta:sum(bs.filter(b=>b.kind==='liquid').map(b=>deltas[b.id])),restrictedDelta:deltas.bridge,scheduledSellTokens:sum(bs.filter(b=>b.kind==='liquid').map(b=>deltas[b.id]*b.sellRate))});previous=byBucket;}return rows;}
export function bridgeQuote(c){const b=c.bridge,cap=Math.min(b.internalCap,div(b.valuationCap,b.referencePrice));return {cap,ratio:div(b.eligibleSupply,cap),value:cap*b.referencePrice,unitValue:div(b.valuationCap,b.eligibleSupply),available:Math.max(0,cap-b.claimed)};}
export function bridgeClaim(c,legacyAmount,ownerClaimed=0){const b=c.bridge,q=bridgeQuote(c);if(!b.frozen)throw Error('The bridge ratio must be frozen before claims.');if(!Number.isFinite(legacyAmount)||legacyAmount<=0)throw Error('Enter a positive finite legacy amount.');if(legacyAmount>b.registered+1e-8)throw Error('Registered entitlement exceeded.');const tokens=legacyAmount/q.ratio;if(tokens>q.available+1e-8)throw Error('Aggregate bridge cap exceeded.');if(tokens+ownerClaimed>q.cap*b.perEntityCap+1e-8)throw Error('Beneficial-owner cap exceeded.');return {legacyBurned:legacyAmount,restrictedIssued:tokens,ratio:q.ratio,remaining:q.available-tokens};}
export function monthlyBudget(c,month){if(month<0)return 0;return (c.rewardBudget[Math.floor(month/12)]||0)/12;}
export function projectFeeIncome(p,month,c,shock=1){return Math.max(0,(p.annualProtocolFees/12)*Math.pow(Math.max(.001,1+c.stress.revenueGrowth),month/12)*shock-p.annualCosts/12);}
export function cashWaterfall(c,netIncome){const s=c.stress,cash=Math.max(0,netIncome);return {gross:cash,rewards:cash*s.feeToRewards,risk:cash*s.feeToRisk,liquidity:cash*s.feeToLiquidity,operations:cash*s.feeToOps,unallocated:cash*(1-sum([s.feeToRewards,s.feeToRisk,s.feeToLiquidity,s.feeToOps]))};}
export function allocateRewards(c,month,locked,qualities=c.projects.map(p=>p.quality*p.bootstrapWeight)){const budget=monthlyBudget(c,month),s=c.stress,weights=locked.map((v,i)=>Math.max(0,v*qualities[i]));const demand=locked.map((v,i)=>Math.max(0,v*s.bootstrapTargetAPR*qualities[i]/12));const total=sum(demand),scale=total>budget?budget/total:1;return {budget,distributed:total*scale,unused:budget-total*scale,byProject:demand.map(v=>v*scale)};}
export function poolEconomics(c,month=0,marketPrice=c.launchPrice,lockedOverrides={}){const locked=c.projects.map(p=>lockedOverrides[p.id]??p.collateral),r=allocateRewards(c,month,locked);return c.projects.map((p,i)=>{const income=projectFeeIncome(p,month,c),w=cashWaterfall(c,income);return {...p,locked:locked[i],netFees:income,distributable:w.rewards,bootstrap:r.byProject[i],realAPR:div(w.rewards*12,locked[i]*marketPrice),bootstrapAPR:div(r.byProject[i]*12,locked[i]),totalAPR:div(w.rewards*12,locked[i]*marketPrice)+div(r.byProject[i]*12,locked[i]),weight:div(r.byProject[i],r.distributed)};});}
