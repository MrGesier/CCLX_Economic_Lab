import {clamp,div} from './model.js';

const EPS=1e-9;
const finite=(v,name,min=-Infinity,max=Infinity)=>{
 const n=Number(v);
 if(!Number.isFinite(n)||n<min||n>max)throw Error(`${name} must be finite in [${min}, ${max}].`);
 return n;
};

export function linearFromEconomics({initialPrice=1,priceAtCapacity=1.6,capacity=1}={}){
 const a=finite(initialPrice,'initialPrice',EPS),cap=finite(capacity,'capacity',EPS),p1=finite(priceAtCapacity,'priceAtCapacity',a);
 return {family:'linear',a,b:(p1-a)/cap,initialPrice:a,priceAtCapacity:p1,capacity:cap};
}

export function powerFromEconomics({initialPrice=1,priceAtReference=1.6,referenceSupply=1,convexity=1.35}={}){
 const a=finite(initialPrice,'initialPrice',EPS),ref=finite(referenceSupply,'referenceSupply',EPS),n=finite(convexity,'convexity',EPS),p=finite(priceAtReference,'priceAtReference',a);
 return {family:'power',a,k:p-a,sRef:ref,n,initialPrice:a,priceAtReference:p,referenceSupply:ref,convexity:n};
}

export function piecewiseFromEconomics({initialPrice=1,capacity=1,segments}={}){
 const cap=finite(capacity,'capacity',EPS);
 const points=(segments?.length?segments:[
  {supply:0,price:initialPrice},
  {supply:cap*.35,price:initialPrice*1.22},
  {supply:cap*.7,price:initialPrice*1.55},
  {supply:cap,price:initialPrice*1.9}
 ]).map((p,i)=>({supply:finite(p.supply,`segments.${i}.supply`,0),price:finite(p.price,`segments.${i}.price`,EPS)})).sort((a,b)=>a.supply-b.supply);
 if(points[0].supply!==0)points.unshift({supply:0,price:points[0].price});
 for(let i=1;i<points.length;i++){if(points[i].supply<=points[i-1].supply)throw Error('Piecewise supplies must increase.');}
 return {family:'piecewise',points,capacity:cap,initialPrice:points[0].price,priceAtCapacity:spot({family:'piecewise',points},cap)};
}

export function normalizeCurve(config={}){
 const f=config.family||'linear';
 if(f==='linear')return linearFromEconomics(config);
 if(f==='power')return powerFromEconomics(config);
 if(f==='piecewise'||f==='milestone_steps')return piecewiseFromEconomics(config);
 throw Error('Unknown curve family: '+f);
}

export function spot(curve,supply){
 const s=finite(supply,'supply',0);
 if(curve.family==='linear')return curve.a+curve.b*s;
 if(curve.family==='power')return curve.a+curve.k*Math.pow(s/curve.sRef,curve.n);
 if(curve.family==='piecewise'||curve.family==='milestone_steps'){
  const pts=curve.points;
  if(s<=pts[0].supply)return pts[0].price;
  for(let i=1;i<pts.length;i++){
   const lo=pts[i-1],hi=pts[i];
   if(s<=hi.supply+EPS){
    const t=div(s-lo.supply,hi.supply-lo.supply);
    return lo.price+(hi.price-lo.price)*clamp(t,0,1);
   }
  }
  const lo=pts.at(-2),hi=pts.at(-1),slope=(hi.price-lo.price)/(hi.supply-lo.supply);
  return hi.price+slope*(s-hi.supply);
 }
 throw Error('Unknown curve family: '+curve.family);
}

export function integral(curve,supply){
 const s=finite(supply,'supply',0);
 if(curve.family==='linear')return curve.a*s+curve.b*s*s/2;
 if(curve.family==='power')return curve.a*s+curve.k*curve.sRef/(curve.n+1)*Math.pow(s/curve.sRef,curve.n+1);
 if(curve.family==='piecewise'||curve.family==='milestone_steps'){
  const pts=curve.points;let area=0,last=pts[0];
  if(s<=0)return 0;
  for(let i=1;i<pts.length;i++){
   const hi=pts[i],end=Math.min(s,hi.supply),dx=end-last.supply;
   if(dx>0){const pEnd=last.price+(hi.price-last.price)*dx/(hi.supply-last.supply);area+=dx*(last.price+pEnd)/2;}
   if(s<=hi.supply+EPS)return area;
   last=hi;
  }
  const prev=pts.at(-2),hi=pts.at(-1),slope=(hi.price-prev.price)/(hi.supply-prev.supply),dx=s-hi.supply;
  return area+dx*hi.price+slope*dx*dx/2;
 }
 throw Error('Unknown curve family: '+curve.family);
}

export function inverseIntegral(curve,reserve,{tolerance=1e-7,maxIterations=96}={}){
 const target=finite(reserve,'reserve',0);
 if(target===0)return 0;
 if(curve.family==='linear'&&curve.b===0)return target/curve.a;
 if(curve.family==='linear')return 2*target/(Math.sqrt(curve.a*curve.a+2*curve.b*target)+curve.a);
 let hi=Math.max(1,curve.capacity||curve.sRef||1);
 while(integral(curve,hi)<target)hi*=2;
 let lo=0;
 for(let i=0;i<maxIterations;i++){
  const mid=(lo+hi)/2,v=integral(curve,mid);
  if(Math.abs(v-target)<=tolerance*Math.max(1,target))return mid;
  if(v<target)lo=mid;else hi=mid;
 }
 return (lo+hi)/2;
}

export function curveSeries(curve,capacity,steps=60){
 const cap=finite(capacity,'capacity',EPS);
 return Array.from({length:steps+1},(_,i)=>{const supply=cap*i/steps;return {supply,spot:spot(curve,supply),reserve:integral(curve,supply)};});
}

export function compareFamilies(base){
 const linear=normalizeCurve({...base,family:'linear'});
 const power=normalizeCurve({...base,family:'power',priceAtReference:base.priceAtCapacity,referenceSupply:base.capacity,convexity:base.convexity||1.45});
 const piecewise=normalizeCurve({...base,family:'piecewise'});
 return [linear,power,piecewise].map(curve=>({curve,series:curveSeries(curve,base.capacity)}));
}
