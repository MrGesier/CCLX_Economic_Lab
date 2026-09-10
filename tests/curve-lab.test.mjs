import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,clone} from '../src/model.js';
import {defaultCurveLabConfig,condensedV5Config,validateCurveConfig,CURVE_LAB_SCENARIOS} from '../src/curve-sim-config.js';
import {normalizeCurve,integral,inverseIntegral} from '../src/curve-families.js';
import {runCurveSimulation,makeVault,quoteDeposit,quoteWithdrawal,quoteMigration,materializeCurveProjects,reconcileCurveState} from '../src/curve-simulation.js';
import {optimizeCurveConfig} from '../src/curve-optimizer.js';

const near=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<=eps*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const smallConfig=()=>{const c=defaultCurveLabConfig(defaults());c.horizonDays=45;c.participants.initial=90;c.totalInitialParticipants=90;c.totalInitialCapitalCCLX=90000;c.capital.medianTicketCCLX=1000;c.projectSchedule=[{day:0,targetActiveProjects:3}];return c;};

test('curve lab default config validates and records assumption provenance',()=>{
 const c=defaultCurveLabConfig();assert.deepEqual(validateCurveConfig(c),[]);
 assert.ok(c.parameterRegister.some(x=>x.path==='fees.defaultMintFee'&&x.origin.includes('synthetic')));
 const v5=condensedV5Config();assert.deepEqual(validateCurveConfig(v5),[]);
 assert.ok(v5.projects.every(p=>p.floorBuffer.currency!=='USD'||p.floorBuffer.convertedCCLX>0));
 assert.match(v5.projects[0].documentStatus,/Prepared for client discussion/);
});

test('power curve integral inverse is monotone and stable',()=>{
 const curve=normalizeCurve({family:'power',initialPrice:1,priceAtReference:2.25,referenceSupply:100000,convexity:1.7});
 let last=0;
 for(const reserve of [1,100,10000,1e6,5e6]){
  const s=inverseIntegral(curve,reserve);assert.ok(s>=last);near(integral(curve,s),reserve,1e-6);last=s;
 }
});

test('deposit and withdrawal reconcile principal and fees',()=>{
 const c=smallConfig(),p=c.projects[0],v=makeVault(p),before=v.backing;
 p.fees.mintFee=0;p.fees.redemptionFee=0;
 const d=quoteDeposit(v,10000,{mintFee:0});v.backing+=d.backingDelta;v.shares+=d.shares;
 const w=quoteWithdrawal(v,d.shares,{redemptionFee:0});v.backing+=w.backingDelta;v.shares-=w.shares;
 near(w.output,10000,1e-6);near(v.backing,before,1e-6);
});

test('migration 10000 at 0.2% out and 0.2% in collects exactly 39.96 CCLX without external capital',()=>{
 const c=smallConfig(),from=c.projects[0],to=c.projects[1],state={vaults:{[from.id]:makeVault(from),[to.id]:makeVault(to)}};
 from.fees.mintFee=.002;from.fees.redemptionFee=.002;to.fees.mintFee=.002;to.fees.redemptionFee=.002;
 const shares=state.vaults[from.id].shares-inverseIntegral(state.vaults[from.id].curve,state.vaults[from.id].backing-10000);
 const q=quoteMigration(state,{originProject:from.id,destinationProject:to.id,shares,redemptionFee:.002,mintFee:.002,routingFee:0});
 near(q.origin.gross,10000,1e-5);near(q.origin.fee,20,1e-8);near(q.destination.fee,19.96,1e-8);near(q.destination.backingDelta,9960.04,1e-8);near(q.totalFees,39.96,1e-8);near(q.externalCapital,0);
});

test('zero activity means zero curve fees while exogenous fees remain separate',()=>{
 const c=smallConfig();c.activity.actionsPerActiveMonth=0;
 const r=runCurveSimulation(c,{seed:77});near(r.summary.cumulativeFeesCCLX,0);near(r.feeAccounts.CCLX.netCollected,0);
 near(r.summary.netProtocolResultUSD,0);
 assert.ok(c.projects[0].externalFees.annualProtocolFeesUSD>0);
});

test('organic growth keeps retained fees positive when explicit costs are disabled',()=>{
 const c=smallConfig();c.horizonDays=120;c.participants.initial=200;c.totalInitialParticipants=200;c.totalInitialCapitalCCLX=200000;
 const organic=CURVE_LAB_SCENARIOS.find(x=>x.id==='organic_growth').changes,r=runCurveSimulation(c,{seed:101,scenario:organic});
 assert.ok(r.summary.cumulativeFeesCCLX>0);assert.ok(r.summary.protocolRetainedFeesCCLX>0);assert.ok(r.summary.netProtocolResultUSD>0);near(r.summary.modeledCostsUSD,0);
});

test('simulation conserves CCLX and is reproducible by config and seed',()=>{
 const c=smallConfig(),a=runCurveSimulation(c,{seed:123}),b=runCurveSimulation(c,{seed:123});
 assert.deepEqual(a.summary,b.summary);assert.equal(a.reconciliation.ok,true);near(a.summary.accountingResidualCCLX,0,1e-6);near(a.summary.receiptResidual,0,1e-6);
});

test('fixed total resources pipeline does not multiply reserve budget when project count grows',()=>{
 const c=condensedV5Config();c.horizonDays=400;c.participants.initial=100;c.totalInitialParticipants=100;c.totalInitialCapitalCCLX=100000;c.projectSchedule=[{day:0,targetActiveProjects:2},{day:90,targetActiveProjects:5},{day:180,targetActiveProjects:10}];c.networkMode='fixed_total_resources';
 const projects=materializeCurveProjects(c),reserve=projects.reduce((s,p)=>s+(p.floorBuffer.currency==='USD'?p.floorBuffer.convertedCCLX:p.floorBuffer.value),0);
 near(reserve,c.totalInitialReserveBudgetCCLX);
 const r=runCurveSimulation(c,{seed:42});assert.equal(r.reconciliation.ok,true);assert.ok(r.daily.at(-1).phaseCounts.announced+r.daily.at(-1).phaseCounts.open_for_deposits+r.daily.at(-1).phaseCounts.funded+r.daily.at(-1).phaseCounts.operating+r.daily.at(-1).phaseCounts.matured>=5);
});

test('optimizer excludes infeasible candidates and keeps validation seeds separate',()=>{
 const c=smallConfig();c.horizonDays=25;
 const out=optimizeCurveConfig(c,{budget:8,selectionSeeds:[1,2],validationSeeds:[9],searchSpace:{mintFee:{type:'number',min:0,max:.03},redemptionFee:{type:'number',min:0,max:.05},slopeScale:{type:'number',min:.8,max:1.2},cooldownDays:{type:'integer',values:[0]},initialProjects:{type:'integer',values:[2]},targetProjects:{type:'integer',values:[3]},launchIntervalDays:{type:'integer',values:[30]},minDemandBeforeLaunchCCLX:{type:'number',values:[0]}}});
 assert.equal(out.selectionSeeds.includes(9),false);assert.equal(out.validationSeeds[0],9);assert.equal(out.candidates.length,8);assert.ok(out.candidates.every(c=>c.paretoRank));
});
