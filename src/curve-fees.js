import {clone,div,sum} from './model.js';

export const FEE_BUCKETS=[
 ['entry','Curve deposit fee'],
 ['exit','Curve redemption fee'],
 ['routing','Migration routing fee'],
 ['rebate','Profile or volume rebate']
];

export function createFeeAccounts(){
 return {
  CCLX:{grossUserFees:0,rebates:0,netCollected:0,treasury:0,rewards:0,reserve:0,lp:0,operations:0,restrictedPending:0},
  USD:{indicativeAtCollection:0,realizedCash:0,saleFees:0,remainingValue:0},
  byProject:{},
  byProfile:{},
  bySource:{unrestricted:0,restricted:0},
  byOperation:Object.fromEntries(FEE_BUCKETS.map(([k])=>[k,0]))
 };
}

export function ensureFeeProject(accounts,projectId){
 accounts.byProject[projectId]??={gross:0,net:0,entry:0,exit:0,routing:0,rebates:0,restricted:0,unrestricted:0};
 return accounts.byProject[projectId];
}

export function recordFee(accounts,{projectId='network',profile='unknown',source='unrestricted',operation='entry',gross=0,rebate=0,priceUSD=0,allocations={}}){
 const g=Number(gross)||0,r=Math.min(g,Math.max(0,Number(rebate)||0)),net=g-r;
 const p=ensureFeeProject(accounts,projectId);
 accounts.CCLX.grossUserFees+=g;accounts.CCLX.rebates+=r;accounts.CCLX.netCollected+=net;
 accounts.CCLX.rewards+=net*(allocations.rewards??0);
 accounts.CCLX.reserve+=net*(allocations.reserve??0);
 accounts.CCLX.lp+=net*(allocations.lp??0);
 accounts.CCLX.operations+=net*(allocations.operations??0);
 accounts.CCLX.treasury+=Math.max(0,net*(1-sum(['rewards','reserve','lp','operations'].map(k=>allocations[k]??0))));
 accounts.USD.indicativeAtCollection+=net*priceUSD;
 accounts.USD.remainingValue+=net*priceUSD;
 accounts.byProfile[profile]=(accounts.byProfile[profile]||0)+net;
 accounts.bySource[source]=(accounts.bySource[source]||0)+net;
 accounts.byOperation[operation]=(accounts.byOperation[operation]||0)+net;
 p.gross+=g;p.net+=net;p[operation]=(p[operation]||0)+net;p.rebates+=r;p[source]=(p[source]||0)+net;
 if(source==='restricted')accounts.CCLX.restrictedPending+=net;
 return {gross:g,rebate:r,net,projectId,profile,source,operation,currency:'CCLX',beneficiary:'protocol_treasury_pending',status:source==='restricted'?'restricted_pending':'collected'};
}

export function sellFeeInventory(accounts,{amountCCLX,priceUSD,executionFee=0}){
 const amount=Math.min(Math.max(0,amountCCLX),accounts.CCLX.treasury+accounts.CCLX.operations+accounts.CCLX.lp+accounts.CCLX.reserve+accounts.CCLX.rewards);
 const gross=amount*priceUSD,fee=gross*executionFee,net=gross-fee;
 accounts.USD.realizedCash+=net;accounts.USD.saleFees+=fee;accounts.USD.remainingValue=Math.max(0,accounts.USD.remainingValue-gross);
 return {amountCCLX:amount,grossUSD:gross,feeUSD:fee,netUSD:net};
}

export function summarizeFeeAccounts(accounts){
 const a=clone(accounts),base=a.CCLX.grossUserFees;
 return {
  ...a,
  realizedTakeRate:div(a.CCLX.netCollected,base),
  allocationCheck:sum(['treasury','rewards','reserve','lp','operations'].map(k=>a.CCLX[k])),
  restrictedLiquidValueCCLX:a.CCLX.restrictedPending
 };
}
