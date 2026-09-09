import {clone,clamp,div,sum,allocation} from './model.js';
const EPS=1e-10;
const assert=(v,k)=>{if(!Number.isFinite(v)||v<0)throw Error('Invalid '+k);};
export function ammSell(x,y,t,fee=.003){assert(t,'trade');if(x===0&&y===0)return 0;if(x<=0||y<=0||fee<0||fee>=1)throw Error('Invalid AMM');const dx=t*(1-fee);return y*dx/(x+dx);}
export function ammBuy(x,y,q,fee=.003){assert(q,'quote');if(x===0&&y===0)return 0;if(x<=0||y<=0||fee<0||fee>=1)throw Error('Invalid AMM');const dy=q*(1-fee);return x*dy/(y+dy);}
export function makeMarket(c,price=c.launchPrice,scale=1){const l=c.liquidity;return {mid:price,bids:l.levels.map((bps,i)=>({bps,cash:Math.max(0,l.cexDepth[i]-(l.cexDepth[i-1]||0))*scale})),asks:l.levels.map((bps,i)=>({bps,tokens:l.cexTokens*scale*([.08,.14,.18,.18,.15,.15,.12][i]||1/l.levels.length)})),x:l.dexTokens*scale,y:l.dexQuote*scale,cexFee:l.cexFee,dexFee:l.dexFee,externalArbCash:0,externalArbTokens:0};}
export const bidCash=m=>sum(m.bids.map(b=>b.cash));
export const askTokens=m=>sum(m.asks.map(a=>a.tokens));
export function cexSell(m,tokens,mutate=false){assert(tokens,'sell');let left=tokens,gross=0,filled=0;const bids=mutate?m.bids:m.bids.map(b=>({...b}));for(const b of bids){const p=m.mid*(1-b.bps/1e4);if(p<=0)continue;const q=Math.min(left,b.cash/p);gross+=q*p;filled+=q;left-=q;b.cash=Math.max(0,b.cash-q*p);if(left<=EPS)break;}if(mutate&&filled>0)m.asks[0].tokens+=filled;return {filled,quote:gross*(1-m.cexFee),gross,unfilled:Math.max(0,left)};}
export function cexBuy(m,quote,mutate=false){assert(quote,'buy');let left=quote,filled=0,spent=0;const asks=mutate?m.asks:m.asks.map(a=>({...a}));for(const a of asks){const p=m.mid*(1+a.bps/1e4);const q=Math.min(a.tokens,left/p);filled+=q;spent+=q*p;left-=q*p;a.tokens=Math.max(0,a.tokens-q);if(left<=EPS)break;}if(mutate&&spent>0)m.bids[0].cash+=spent;return {tokens:filled*(1-m.cexFee),spent,unfilled:Math.max(0,left)};}
function maximize(f,hi){let l=0,r=hi;for(let i=0;i<32;i++){const a=l+(r-l)/3,b=r-(r-l)/3;if(f(a)<f(b))l=a;else r=b;}const choices=[0,hi,(l+r)/2];return choices.reduce((best,q)=>f(q)>best.value?{q,value:f(q)}:best,{q:0,value:f(0)}).q;}
export function executeSell(m,tokens,mutate=false){assert(tokens,'sell');if(tokens===0)return {filled:0,quote:0,unfilled:0,cex:0,dex:0,average:0,slippage:0};const capacity=sum(m.bids.map(b=>b.cash/(m.mid*(1-b.bps/1e4))));const routed=m.x>0?tokens:Math.min(tokens,capacity);const split=maximize(q=>cexSell(m,q).quote+ammSell(m.x,m.y,routed-q,m.dexFee),Math.min(routed,capacity));const a=cexSell(m,split,mutate),b=ammSell(m.x,m.y,routed-split,m.dexFee);if(mutate){m.x+=routed-split;m.y-=b;}const quote=a.quote+b;return {filled:routed,quote,unfilled:Math.max(0,tokens-routed),cex:a.quote,dex:b,average:div(quote,routed),slippage:1-quote/(routed*m.mid)||0};}
export function executeBuy(m,quote,mutate=false){assert(quote,'buy');if(quote===0)return {tokens:0,spent:0,unfilled:0,cex:0,dex:0,average:0,slippage:0};const capacity=sum(m.asks.map(a=>a.tokens*m.mid*(1+a.bps/1e4)));const routed=m.x>0?quote:Math.min(quote,capacity);const split=maximize(q=>cexBuy(m,q).tokens+ammBuy(m.x,m.y,routed-q,m.dexFee),Math.min(routed,capacity));const a=cexBuy(m,split,mutate),b=ammBuy(m.x,m.y,routed-split,m.dexFee);if(mutate){m.x-=b;m.y+=routed-split;}const tokens=a.tokens+b;return {tokens,spent:routed,unfilled:Math.max(0,quote-routed),cex:a.tokens,dex:b,average:div(routed,tokens),slippage:tokens>0?routed/(tokens*m.mid)-1:0};}
/** Executable marginal-price depth relative to the reference mid. Fees are excluded from the quoted band, and reported separately in execution. */
export function marketDepth(m,bps,side='sell'){
 if(bps<=0||bps>=10000)throw Error('Depth band must be 0–100%.');
 const d=bps/1e4,k=m.x*m.y;
 if(side==='sell'){
  const floor=m.mid*(1-d);
  const bids=m.bids.filter(b=>b.bps<=bps);
  const cex=sum(bids.map(b=>b.cash));
  const targetX=k>0?Math.sqrt(k/floor):0;
  const dex=targetX>m.x?Math.max(0,m.y-k/targetX):0;
  const baseQty=sum(bids.map(b=>b.cash/(m.mid*(1-b.bps/1e4))))+Math.max(0,targetX-m.x)/(1-m.dexFee);
  return {cex,dex,total:cex+dex,baseQty};
 }
 const ceiling=m.mid*(1+d);
 const cex=sum(m.asks.filter(a=>a.bps<=bps).map(a=>a.tokens*m.mid*(1+a.bps/1e4)));
 const targetX=k>0?Math.sqrt(k/ceiling):0;
 const dex=targetX<m.x&&targetX>0?Math.max(0,k/targetX-m.y):0;
 return {cex,dex,total:cex+dex};
}
export const depthLadder=m=>[25,50,100,200,500,1000].map(bps=>({bps,...marketDepth(m,bps)}));
/** Explicit external arbitrage. Finite cash/token limits prevent a price rebase from silently refilling the pool. */
export function reprice(m,price,limits={}){
 if(!Number.isFinite(price)||price<=0)throw Error('Invalid price');
 const cash=limits.cash??Infinity,tokens=limits.tokens??Infinity;
 if(cash<0||tokens<0||Number.isNaN(cash)||Number.isNaN(tokens))throw Error('Invalid arbitrage limits');
 const k=m.x*m.y,oldX=m.x,oldY=m.y;
 m.mid=price;
 if(k>0){
  let x=Math.sqrt(k/price),y=k/x;
  if(y>oldY+cash){y=oldY+cash;x=k/y;}
  if(x>oldX+tokens){x=oldX+tokens;y=k/x;}
  m.x=x;m.y=y;
 }
 const quoteDelta=m.y-oldY,tokenDelta=m.x-oldX;
 m.externalArbCash+=quoteDelta;m.externalArbTokens+=tokenDelta;
 return {quoteDelta,tokenDelta,cashUsed:Math.max(0,quoteDelta),tokensUsed:Math.max(0,tokenDelta),cashReturned:Math.max(0,-quoteDelta),tokensReturned:Math.max(0,-tokenDelta)};
}
export function refillBids(m,usd){assert(usd,'replenishment');const weights=[.1,.12,.18,.2,.16,.14,.1];m.bids.forEach((b,i)=>b.cash+=usd*(weights[i]||0));return usd;}
export function guardedSell(m,tokens,maxSlippage=.2,mutate=false){assert(tokens,'sell');if(tokens===0)return {...executeSell(m,0),requested:0};let lo=0,hi=tokens;for(let i=0;i<27;i++){const mid=(lo+hi)/2;const q=executeSell(m,mid);if(q.unfilled<=1e-7&&q.slippage<=maxSlippage)lo=mid;else hi=mid;}const result=executeSell(m,lo,mutate);return {...result,requested:tokens,unfilled:Math.max(0,tokens-lo)};}
export function guardedBuy(m,quote,maxSlippage=.2,mutate=false){assert(quote,'buy');if(quote===0)return {...executeBuy(m,0),requested:0};let lo=0,hi=quote;for(let i=0;i<27;i++){const mid=(lo+hi)/2;const q=executeBuy(m,mid);if(q.unfilled<=1e-7&&q.slippage<=maxSlippage)lo=mid;else hi=mid;}const result=executeBuy(m,lo,mutate);return {...result,requested:quote,unfilled:Math.max(0,quote-lo)};}
export function maximumExecutable(m,slippage=.01,side='sell'){let lo=0,hi=side==='sell'?m.x*100+1e9:m.y*100+1e9;for(let i=0;i<40;i++){const mid=(lo+hi)/2,r=side==='sell'?executeSell(m,mid):executeBuy(m,mid);if(r.unfilled<=1e-7&&r.slippage<=slippage)lo=mid;else hi=mid;}const q=side==='sell'?executeSell(m,lo):executeBuy(m,lo);return {input:lo,notional:side==='sell'?lo*m.mid:lo,output:side==='sell'?q.quote:q.tokens,slippage:q.slippage};}
export function initialLiquidityAudit(c){const l=c.liquidity,m=makeMarket(c),bands=depthLadder(m);const sell=executeSell(m,l.tradeTarget),buy=executeBuy(m,l.tradeTarget*c.launchPrice);const depth=marketDepth(m,200),inventory=l.cexTokens+l.dexTokens;const checks=[
{name:'Quote capital is fully funded',pass:l.cexQuote+l.dexQuote<=l.budget+1e-6,detail:`$${l.cexQuote+l.dexQuote} assigned / $${l.budget} authorized`},
{name:'DEX reference price reconciles',pass:Math.abs(l.dexQuote/l.dexTokens-c.launchPrice)/c.launchPrice<.01,detail:`DEX spot $${(l.dexQuote/l.dexTokens).toFixed(4)} vs $${c.launchPrice}`},
{name:'MM token inventory is allocated',pass:inventory<=allocation(c,'liquidity')+1e-6,detail:`${inventory.toFixed(0)} / ${allocation(c,'liquidity')} CCLX`},
{name:'Initial float is bounded by the maximum supply',pass:5e6+inventory+2e6+1e6<=c.supply,detail:`Working initial float ${(5e6+inventory+2e6+1e6).toFixed(0)} CCLX; includes MM inventory, not extra supply`},
{name:'2% bid-depth target',pass:depth.total>=l.depthTarget,detail:`$${depth.total.toFixed(0)} / $${l.depthTarget}`},
{name:'Reference sell slippage',pass:sell.slippage<=l.slippageTarget,detail:`${(sell.slippage*100).toFixed(2)}% / ${(l.slippageTarget*100).toFixed(2)}% target`},
{name:'Reference buy slippage',pass:buy.slippage<=l.slippageTarget,detail:`${(buy.slippage*100).toFixed(2)}% / ${(l.slippageTarget*100).toFixed(2)}% target`}
];return {budget:l.budget,assignedQuote:l.cexQuote+l.dexQuote,inventory,inventoryValue:inventory*c.launchPrice,unallocatedCash:l.budget-l.cexQuote-l.dexQuote,within2:depth.total,bands,sell,buy,checks,pass:checks.every(x=>x.pass),capacity:[.005,.01,.02,.05,.1].map(v=>({slippage:v,sell:maximumExecutable(m,v),buy:maximumExecutable(m,v,'buy')})),disclaimer:'Synthetic CEX ladder and constant-product AMM. Depth is executable only within the stated assumptions; MM inventory value is not additional cash.'};}
export function sizeLiquidity(c,{targetDepth=c.liquidity.depthTarget,targetSlippage=c.liquidity.slippageTarget,tradeTokens=c.liquidity.tradeTarget,maximumBudget=1e7}={}){const candidate=scale=>{const x=clone(c);x.liquidity.budget*=scale;x.liquidity.cexQuote*=scale;x.liquidity.dexQuote*=scale;x.liquidity.cexTokens*=scale;x.liquidity.dexTokens*=scale;x.liquidity.cexDepth=x.liquidity.cexDepth.map(v=>v*scale);return x;};const good=scale=>{const x=candidate(scale),m=makeMarket(x);return marketDepth(m,200).total>=targetDepth&&executeSell(m,tradeTokens).slippage<=targetSlippage&&executeBuy(m,tradeTokens*c.launchPrice).slippage<=targetSlippage;};let lo=0,hi=1;while(!good(hi)&&hi*c.liquidity.budget<maximumBudget)hi*=2;if(!good(hi))return {feasible:false,requiredBudget:null,reason:'No feasible solution within the permitted budget and inventory assumptions.'};for(let i=0;i<42;i++){const mid=(lo+hi)/2;if(good(mid))hi=mid;else lo=mid;}const x=candidate(hi),tokens=x.liquidity.cexTokens+x.liquidity.dexTokens;return {feasible:tokens<=allocation(c,'liquidity')+1e-6&&hi*c.liquidity.budget<=maximumBudget,requiredBudget:x.liquidity.budget,requiredCexQuote:x.liquidity.cexQuote,requiredDexQuote:x.liquidity.dexQuote,requiredTokens:tokens,scale:hi,withinAllocation:tokens<=allocation(c,'liquidity')+1e-6,checks:initialLiquidityAudit(x).checks};}
