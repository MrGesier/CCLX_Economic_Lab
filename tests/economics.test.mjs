import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,clone,validate,sum,fundingTable,initialFloat,unlockSchedule,vestFraction,rewardCumulative,REWARD_BUDGET,allocateRewards,bridgeQuote,bridgeClaim,poolEconomics,cashWaterfall} from '../src/model.js';
import {curveIntegral,sharesForReserve,newVault,curveTrade,curveQuote,curveAudit,rebaseCurve} from '../src/curve.js';
import {makeMarket,ammSell,ammBuy,executeSell,executeBuy,guardedSell,guardedBuy,marketDepth,depthLadder,reprice,refillBids,bidCash,initialLiquidityAudit,sizeLiquidity} from '../src/market.js';
import {newMock,mockAction,mockMetrics} from '../src/mock.js';
import {runStress,simulatePath,SCENARIOS,rng} from '../src/stress.js';
import {unlockPressureAudit,launchReadiness,liquidityFrontier,priceDepthGrid} from '../src/analysis.js';
import {runAttackSuite} from '../src/attacks.js';
import {parseOrderBookCSV,analyzeSnapshot} from '../src/calibration.js';
const c=defaults();
const near=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<=eps*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const rejects=(f,re)=>assert.throws(f,re);

test('working assumptions reconcile exactly to the maximum supply',()=>{
 assert.deepEqual(validate(c),[]);assert.equal(sum(c.allocations.map(x=>x.tokens)),200e6);assert.equal(sum(c.rewardBudget),26e6);
 assert.equal(initialFloat(c),16e6);assert.equal(sum(c.rounds.map(x=>x.tokens)),44e6);
 const f=fundingTable(c);assert.equal(sum(f.map(x=>x.raised)),7680000);for(const r of f){near(r.fdv,r.price*c.supply);near(r.share,r.tokens/c.supply);}
});
test('invalid configurations are rejected before simulation',()=>{
 const x=clone(c);x.allocations[0].tokens++;assert.match(validate(x).join(),/sum/);
 x.allocations[0].tokens--;x.bridge.internalCap=37e6;assert.match(validate(x).join(),/Team/);
 x.bridge.internalCap=12e6;x.stress.feeToRewards=1;assert.match(validate(x).join(),/100%/);
 x.stress.feeToRewards=.3;x.liquidity.dexTokens=0;assert.ok(validate(x).length);
});
test('cliff, linear vesting and reward ceilings have correct boundaries',()=>{
 assert.equal(vestFraction(-1,12,24),0);assert.equal(vestFraction(0,12,24),0);assert.equal(vestFraction(12,12,24),0);assert.equal(vestFraction(24,12,24),.5);assert.equal(vestFraction(36,12,24),1);
 near(vestFraction(0,0,6,.5),.5);near(vestFraction(3,0,6,.5),.75);
 assert.equal(rewardCumulative(0),0);assert.equal(rewardCumulative(12),5e6);assert.equal(rewardCumulative(96),26e6);assert.equal(rewardCumulative(200),26e6);
});
test('restricted releases and unissued rewards are excluded from sellable unlocks',()=>{
 const u=unlockSchedule(c,120);for(const r of u){assert.ok(r.scheduledSellTokens<=r.liquidDelta+1e-6);assert.ok(r.restrictedDelta>=0);assert.ok(r.cumulative<=c.supply);}
 assert.equal(u[12].deltas.bridge,0);assert.ok(u[24].deltas.bridge>0);assert.equal(u[96].rewardCeiling,26e6);
 assert.equal(u[120].restricted,12e6);
});
test('legacy bridge ratio derives from valuation and respects both caps',()=>{
 const q=bridgeQuote(c);near(q.cap,12e6);near(q.ratio,75);near(q.value,3.3e6);
 const claim=bridgeClaim(c,75000);near(claim.restrictedIssued,1000);
 const x=clone(c);x.bridge.claimed=q.cap-1;rejects(()=>bridgeClaim(x,150),/cap/);
 x.bridge.claimed=0;x.bridge.perEntityCap=.001;rejects(()=>bridgeClaim(x,75000,12000),/owner/);
 x.bridge.frozen=false;rejects(()=>bridgeClaim(x,75000),/frozen/);
});
test('cash waterfall and rewards conserve capped resources',()=>{
 const w=cashWaterfall(c,100000);near(sum([w.rewards,w.risk,w.liquidity,w.operations,w.unallocated]),100000);
 const r=allocateRewards(c,0,[1e9,1e9,1e9]);assert.ok(r.distributed<=REWARD_BUDGET[0]/12+1e-5);near(sum(r.byProject),r.distributed);
 const pools=poolEconomics(c);assert.equal(new Set(pools.map(p=>p.totalAPR.toFixed(5))).size,3);
 for(const p of pools){near(p.realAPR,p.distributable*12/(p.locked*c.launchPrice));near(p.totalAPR,p.realAPR+p.bootstrapAPR);}
});
test('curve integral and inverse are stable across reserves',()=>{
 for(const reserve of [0,.000001,1,1000,1e6,1e9]){const s=sharesForReserve(.9,1.2e-7,reserve);near(curveIntegral(.9,1.2e-7,s),reserve,1e-6);}
});
test('randomized reserve-curve trades never create unfunded collateral',()=>{
 const v=newVault(c.projects[0]),r=rng(887);let deposits=0,withdrawals=0;
 for(let i=0;i<300;i++){
  if(r()<.62&&v.backing<v.capacity-100){const amount=Math.min(100+r()*10000,(v.capacity-v.backing)/1.01);const q=curveTrade(v,amount,'deposit');deposits+=amount;assert.ok(q.shares>=0);}
  else if(v.shares>0){const q=curveTrade(v,v.shares*r()*.25,'withdraw');withdrawals+=q.output;}
  assert.equal(curveAudit(v).solvent,true);assert.ok(v.backing>=0);
 }
 assert.ok(withdrawals<=deposits+c.projects[0].collateral);rejects(()=>rebaseCurve(v,v.a*2,v.b,0),/Unfunded/);
});
test('AMM outputs are finite, monotone, and never exceed reserves',()=>{
 let last=0;for(const n of [1,100,10000,1e6,1e9]){const out=ammSell(1e6,275000,n);assert.ok(out>=last&&out<275000);last=out;}
 assert.ok(ammBuy(1e6,275000,1e9)<1e6);
 near(ammSell(1e6,275000,0),0);
});
test('market execution has finite funding and preserves order-book inventory accounting',()=>{
 const m=makeMarket(c),before=bidCash(m),beforeX=m.x,beforeY=m.y;const q=executeSell(m,1e6,true);
 assert.ok(q.filled<=1e6&&q.unfilled>=0&&q.quote<=before+beforeY);assert.ok(m.x>=beforeX&&m.y<=beforeY&&m.y>=0);
 near(q.filled+q.unfilled,1e6);assert.ok(bidCash(m)<=before);assert.ok(q.slippage>=0);
 const b=executeBuy(m,100000,true);assert.ok(b.tokens>=0&&b.spent<=100000&&b.unfilled>=0);near(b.spent+b.unfilled,100000);
});
test('marginal-price depth is monotone and fee-independent',()=>{
 const m=makeMarket(c),d=depthLadder(m);for(let i=1;i<d.length;i++)assert.ok(d[i].total>=d[i-1].total);
 const x=marketDepth(m,200);const copy=clone(m);copy.dexFee=.02;near(marketDepth(copy,200).total,x.total);
 const noPool=clone(m);noPool.x=0;noPool.y=0;assert.equal(marketDepth(noPool,200).dex,0);
});
test('slippage guards preserve unfilled orders rather than assuming infinite depth',()=>{
 const m=makeMarket(c),sell=guardedSell(m,50e6,.01,true);assert.ok(sell.slippage<=.0100001);assert.ok(sell.unfilled>0);near(sell.filled+sell.unfilled,50e6);
 const buy=guardedBuy(m,100e6,.01,true);assert.ok(buy.slippage<=.0100001);assert.ok(buy.unfilled>0);near(buy.spent+buy.unfilled,100e6);
});
test('finite external arbitrage cannot replenish a DEX without resources',()=>{
 const m=makeMarket(c),x=m.x,y=m.y;const q=reprice(m,c.launchPrice*2,{cash:0,tokens:0});near(m.x,x);near(m.y,y);assert.equal(q.cashUsed,0);
 const a=reprice(m,c.launchPrice*2,{cash:1000,tokens:0});assert.ok(a.cashUsed<=1000+1e-6);assert.ok(m.y-y<=1000+1e-6);
 const b=reprice(m,c.launchPrice*.5,{cash:0,tokens:100});assert.ok(b.tokensUsed<=100+1e-6);
});
test('launch liquidity audit and sizing honor cash and token allocations',()=>{
 const a=initialLiquidityAudit(c);assert.equal(a.pass,true);near(a.assignedQuote,1.5e6);near(a.inventory,8e6);assert.ok(a.within2>600000);
 const s=sizeLiquidity(c);assert.equal(s.feasible,true);assert.ok(s.requiredBudget<=c.liquidity.budget);assert.ok(s.requiredTokens<=16e6);
 assert.equal(sizeLiquidity(c,{targetDepth:100e6,maximumBudget:1e6}).feasible,false);
 assert.ok(liquidityFrontier(c).length>0);assert.equal(priceDepthGrid(c).length,6);
});
test('mock purchase, allocation, withdrawal and claims use actual state transitions',()=>{
 let s=newMock(c);s=mockAction(s,c,'buy',{amount:1000});assert.ok(s.wallet.liquid>0&&s.wallet.usd<25000);
 const acquired=s.wallet.liquid;s=mockAction(s,c,'allocate',{amount:acquired/2,projectId:'forest'});assert.ok(s.wallet.positions[0].shares>0);
 s=mockAction(s,c,'advance',{amount:30});const pending=mockMetrics(s,c).pendingRewards;assert.ok(pending>0);
 s=mockAction(s,c,'claim');const first=s.wallet.liquid;s=mockAction(s,c,'claim');near(s.wallet.liquid,first);
 const value=mockMetrics(s,c).positions[0].value;s=mockAction(s,c,'withdraw',{amount:value/2,projectId:'forest'});assert.ok(s.wallet.liquid>first);
 assert.ok(mockMetrics(s,c).vaults.every(v=>v.solvent));
});
test('legacy conversion can never make principal or rewards freely saleable',()=>{
 let s=newMock(c);s=mockAction(s,c,'convert',{amount:75000,nonce:'a'});assert.equal(s.wallet.liquid,0);rejects(()=>mockAction(s,c,'convert',{amount:1,nonce:'a'}),/nonce/);
 rejects(()=>mockAction(s,c,'allocate',{amount:1,projectId:'forest',restricted:true}),/Insufficient/);
 s=mockAction(s,c,'advance',{amount:365});assert.ok(s.wallet.restricted<1e-5);
 s=mockAction(s,c,'advance',{amount:365});assert.ok(s.wallet.restricted>0);
 const amount=s.wallet.restricted;s=mockAction(s,c,'allocate',{amount,projectId:'forest',restricted:true});s=mockAction(s,c,'advance',{amount:30});s=mockAction(s,c,'claim');
 assert.ok(s.wallet.restrictedRewards>0);assert.equal(s.wallet.liquid,0);
 const value=mockMetrics(s,c).positions.find(p=>p.restricted).value;s=mockAction(s,c,'withdraw',{amount:value,projectId:'forest',restricted:true});assert.equal(s.wallet.liquid,0);
 rejects(()=>mockAction(s,c,'sell',{amount:1,restricted:true}),/unrestricted/);
 for(const type of ['wrap','receiptTransfer','pledge'])rejects(()=>mockAction(s,c,type,{amount:1,restricted:true}),/cannot/);
});
test('restricted borrowing is prohibited even when ordinary borrowing is enabled',()=>{
 const x=clone(c);x.stress.borrowEnabled=true;let s=newMock(x);s.wallet.restricted=1000;s=mockAction(s,x,'allocate',{amount:1000,projectId:'forest',restricted:true});rejects(()=>mockAction(s,x,'borrow',{amount:1,projectId:'forest',restricted:true}),/prohibited/);
});
test('attack suite distinguishes model passes from external verification',()=>{
 const r=runAttackSuite(c);assert.equal(r.failed,0);assert.ok(r.passed>=15);assert.ok(r.unverified>=4);assert.ok(r.results.some(x=>x.id==='reentrancy'&&x.status==='unverified'));
});
test('Financial Simulation base grows while stress scenarios still report depth breaches',()=>{
 const x=clone(c);x.stress.paths=8;x.stress.months=24;
 const a=runStress(x),b=runStress(x);assert.deepEqual(a.summary,b.summary);assert.equal(a.series.length,24);
 assert.ok(a.summary.terminalPrice.p50>x.launchPrice);assert.ok(a.summary.depthBreachProbability>=0&&a.summary.depthBreachProbability<=1);
 const stressed=runStress(x,SCENARIOS.find(s=>s.id==='liquidity').changes);assert.ok(stressed.summary.depthBreachProbability>0);assert.ok(stressed.summary.depthBreachProbability<=1);
 assert.ok(a.summary.reserveExhaustionProbability>=0&&a.summary.reserveExhaustionProbability<=1);
 const p=simulatePath(x,x.stress.seed);assert.equal(p.summary.depthBreach,p.rows.some(r=>r.coverage!==null&&r.coverage<x.liquidity.coverageTarget));
 for(const row of p.rows){assert.ok(Number.isFinite(row.price)&&row.price>0);assert.ok(row.liquidityReserve>=0&&row.riskReserve>=0);assert.ok(row.dexQuote>=0);assert.ok(row.cumulativeEmitted<=rewardCumulative(row.month,x.rewardBudget)+1e-4);assert.ok(row.restrictedReward>=0);assert.ok(row.restrictedStaked<=row.staked+1e-6);assert.equal(row.byBucket.bridge,0);assert.ok(row.unfilled>=0&&row.queue>=0);assert.ok(row.liquidCirculating<=x.supply);}
});
test('a finite reserve with no replenishment cannot be silently restored',()=>{
 const x=clone(c);x.stress.paths=2;x.stress.months=12;x.stress.liquidityReserve=0;x.stress.liquidityTopup=0;x.stress.feeToLiquidity=0;x.stress.mmReplenishment=1;
 const p=simulatePath(x);assert.equal(p.summary.liquidityConsumed,0);assert.equal(p.summary.externalTopups,0);assert.ok(p.summary.reserveExhausted);assert.ok(p.rows.every(r=>r.liquidityReserve===0));
});
test('stress scenario overrides and pain-zone probabilities are coherent',()=>{
 const x=clone(c);x.stress.paths=5;x.stress.months=12;const r=runStress(x,SCENARIOS.find(s=>s.id==='liquidity').changes);
 assert.equal(r.meta.paths,5);assert.ok(r.series.every(z=>z.failProbability>=0&&z.failProbability<=1));
 near(r.summary.depthBreachProbability,r.pathSummaries.filter(p=>p.depthBreach).length/5);
 assert.ok(r.series.every(z=>z.coverage.p50<=10));
});
test('CSV calibration parses valid orders and rejects invalid data',()=>{
 const rows=parseOrderBookCSV('side,price,quantity,venue\nbid,0.274,1000,A\nask,0.276,2000,A');const a=analyzeSnapshot(rows,c);near(a.mid,.275);assert.equal(a.venues.length,1);assert.ok(a.trade.unfilled>=0);
 rejects(()=>parseOrderBookCSV('side,price,quantity\nbid,-1,2'),/Invalid/);rejects(()=>parseOrderBookCSV('side,price,quantity\nhack,1,2'),/Invalid/);
});
test('launch readiness remains unverified without real evidence',()=>{
 const a=launchReadiness(c,null,runAttackSuite(c));assert.equal(a.ready,false);assert.ok(a.unverified>=4);
});
