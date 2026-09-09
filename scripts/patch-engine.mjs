import {readFile,writeFile} from 'node:fs/promises';
const replace=async(file,changes)=>{let s=await readFile(file,'utf8');for(const [a,b] of changes){if(!s.includes(a))throw Error('Patch target missing: '+file+' '+a.slice(0,80));s=s.replace(a,b);}await writeFile(file,s);};
await replace('src/curve.js',[
['(Math.sqrt(a*a+2*b*reserve)-a)/b','2*reserve/(Math.sqrt(a*a+2*b*reserve)+a)'],
['if(v.backing<0||v.shares<0)throw Error(\'Curve insolvency.\');','if(v.backing<0||v.shares<0)throw Error(\'Curve insolvency.\');']
]);
await replace('src/market.js',[
['const cex=sum(bids.map(b=>b.cash));','const cex=sum(bids.map(b=>b.cash));'],
['const dex=targetX>m.x?Math.max(0,m.y-k/targetX):0;','const dex=targetX>m.x?Math.max(0,m.y-k/targetX):0;'],
['const dex=targetX<m.x&&targetX>0?Math.max(0,k/targetX-m.y)/(1-m.dexFee):0;','const dex=targetX<m.x&&targetX>0?Math.max(0,k/targetX-m.y):0;'],
['const weights=[.1,.12,.18,.2,.16,.14,.1];','const weights=[.1,.12,.18,.2,.16,.14,.1];'],
['return {budget:l.budget,assignedQuote:', 'return {budget:l.budget,assignedQuote:']
]);
await replace('src/model.js',[
["export const VERSION='1.0.0';","export const VERSION='1.1.0';"],
["export function validate(c){const e=[];","export function validate(c){const e=[];"],
["if(b.claimed>Math.min(b.internalCap,b.valuationCap/b.referencePrice))e.push('Existing bridge claims exceed the cap.');","if(b.claimed>Math.min(b.internalCap,b.valuationCap/b.referencePrice))e.push('Existing bridge claims exceed the cap.');\n if(b.internalCap>0&&b.cliff+b.linear<=0)e.push('Restricted conversion requires a vesting schedule.');"],
["for(const k of ['annualDrift','annualVol'", "for(const k of ['annualDrift','annualVol'"]
]);
// The reference model is deliberately kept as a proposal. The extra audit labels below avoid conflating float, budget and collateral.
let m=await readFile('src/model.js','utf8');
m=m.replace("export const allocation=(c,id)=>", "export const initialFloat=c=>sum(c.rounds.map(r=>r.tokens*r.tge))+allocation(c,'liquidity')*.5+2e6+1e6;\nexport const allocation=(c,id)=>");
m=m.replace("if(b.internalCap>allocation(c,'team'))", "if(b.internalCap>allocation(c,'team'))");
await writeFile('src/model.js',m);
let st=await readFile('src/stress.js','utf8');
st=st.replace("const initialStake=sum(c.projects.map(p=>p.collateral));\n  const freeTarget=Math.min(sum(remainingCaps),freeSupply,Math.max(initialStake,freeSupply*s.stakingParticipation));", "const freeTarget=Math.min(sum(remainingCaps),freeSupply,freeSupply*s.stakingParticipation);");
st=st.replace("const staked=sum(locks),freeStaked=sum(freeLocks),activeFloat=Math.max(0,release.liquid+emittedFree-freeStaked);", "const staked=sum(locks),freeStaked=sum(freeLocks),activeFloat=Math.max(0,release.liquid+emittedFree-freeStaked),mmInventory=Math.min(c.liquidity.cexTokens+c.liquidity.dexTokens,c.allocations.find(a=>a.id==='liquidity').tokens);\n  const totalCirculating=release.liquid+emittedFree+mmInventory;");
st=st.replace("const depthPost=marketDepth(m,200).total,drawdown=1-price/peak;", "const depthPost=marketDepth(m,200).total,drawdown=1-price/peak,unfundedRefill=Math.max(0,desired-replenish);");
st=st.replace("liquidCirculating:release.liquid+emittedFree,activeFloat", "liquidCirculating:totalCirculating,publicCirculating:release.liquid+emittedFree,mmInventory,activeFloat");
st=st.replace("liquidityConsumed,mmWithdrawn,arbCash:", "liquidityConsumed,unfundedRefill,mmWithdrawn,arbCash:");
st=st.replace("reserveExhausted:rows.some(x=>x.liquidityReserve<=1e-6&&x.queue>0)","reserveExhausted:rows.some(x=>x.unfundedRefill>1e-6),maxUnfundedRefill:Math.max(0,...rows.map(x=>x.unfundedRefill))");
st=st.replace("minLiquidityReserve:Math.min(...rows.map(x=>x.liquidityReserve))", "minLiquidityReserve:Math.min(...rows.map(x=>x.liquidityReserve))");
// Preserve raw scheduled unlock pressure separately from the amount that can actually be presented for execution.
st=st.replace("const freeForNewSales=Math.max(0,activeFloat-queue);", "const scheduledUnlockDemand=unlockSales;\n  const freeForNewSales=Math.max(0,activeFloat-queue);");
st=st.replace("unlockSales,byBucket,rewardSales", "unlockSales,scheduledUnlockDemand,byBucket,rewardSales");
st=st.replace("let price=c.launchPrice,external=price,peak=price", "let price=c.launchPrice,external=price,peak=price");
// The exogenous reference is not claimed to be the executed marginal price or to create liquidity.
st=st.replace("const depthPre=marketDepth(m,200).total,unlockPressure", "const depthPre=marketDepth(m,200).total,unlockPressure");
await writeFile('src/stress.js',st);
console.log('Engine patches applied.');
