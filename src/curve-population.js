import {clamp,div,sum} from './model.js';

export const PROFILE_MIX=[
 {id:'long_term',name:'Long-term holder',share:.38,risk:.35,activity:.55,migration:.35,ticketScale:.9,inertia:.75},
 {id:'rebalancer',name:'Rebalancer',share:.24,risk:.55,activity:1.35,migration:1.55,ticketScale:1.05,inertia:.35},
 {id:'active_user',name:'Active user',share:.25,risk:.6,activity:1.75,migration:1.1,ticketScale:.55,inertia:.25},
 {id:'whale',name:'Whale',share:.04,risk:.45,activity:.75,migration:.85,ticketScale:9,inertia:.55},
 {id:'restricted_user',name:'Restricted user',share:.09,risk:.25,activity:.45,migration:.25,ticketScale:.8,inertia:.85,restricted:true}
];

export function normalizedProfiles(profiles=PROFILE_MIX){
 const total=sum(profiles.map(p=>Math.max(0,p.share)));
 return profiles.map(p=>({...p,share:div(Math.max(0,p.share),total||1)}));
}

export function chooseWeighted(items,weights,r){
 const total=sum(weights.map(x=>Math.max(0,x)));
 if(total<=0)return items[0];
 let x=r()*total;
 for(let i=0;i<items.length;i++){x-=Math.max(0,weights[i]);if(x<=0)return items[i];}
 return items.at(-1);
}

export function logNormalTicket(median,dispersion,r){
 const u=Math.max(1e-12,r()),v=Math.max(1e-12,r());
 const z=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
 return Math.max(0,median*Math.exp((dispersion||0)*z));
}

export function buildParticipants(config,r){
 const profiles=normalizedProfiles(config.profiles||PROFILE_MIX),participants=[],n=Math.round(config.participants.initial);
 const raw=[];
 for(let i=0;i<n;i++){
  const p=chooseWeighted(profiles,profiles.map(x=>x.share),r);
  raw.push({profile:p,amount:logNormalTicket(config.capital.medianTicketCCLX*p.ticketScale,config.capital.dispersion,r)});
 }
 const total=sum(raw.map(x=>x.amount)),scale=div(config.totalInitialCapitalCCLX,total);
 for(let i=0;i<n;i++){
  const p=raw[i].profile,restricted=!!p.restricted&&r()<Math.max(config.restrictedShare,.65);
  participants.push({id:`u${String(i+1).padStart(5,'0')}`,profileId:p.id,profile:p.name,joinedDay:0,lastActionDay:-Infinity,active:true,restricted,wallet:{unrestricted:restricted?0:raw[i].amount*scale,restricted:restricted?raw[i].amount*scale:0},positions:{}});
 }
 return participants;
}

export function addDailyParticipants(state,config,day,r){
 const countBase=config.participants.newPerDay||0,whole=Math.floor(countBase),extra=r()<countBase-whole?1:0,count=Math.max(0,whole+extra);
 if(!count)return [];
 const profiles=normalizedProfiles(config.profiles||PROFILE_MIX),created=[];
 for(let i=0;i<count&&state.participants.length<config.participants.adoptionCap;i++){
  const p=chooseWeighted(profiles,profiles.map(x=>x.share),r),amount=logNormalTicket(config.participants.budgetPerNewParticipantCCLX*p.ticketScale,config.capital.dispersion,r);
  const id=`u${String(state.participants.length+1).padStart(5,'0')}`,restricted=!!p.restricted&&r()<Math.max(config.restrictedShare,.5);
  const participant={id,profileId:p.id,profile:p.name,joinedDay:day,lastActionDay:-Infinity,active:true,restricted,wallet:{unrestricted:restricted?0:amount,restricted:restricted?amount:0},positions:{}};
  state.participants.push(participant);state.externalInflowsCCLX+=amount;created.push(participant);
 }
 return created;
}

export function profileById(id,profiles=PROFILE_MIX){return (profiles||PROFILE_MIX).find(p=>p.id===id)||PROFILE_MIX[0];}

export function shouldAct(participant,config,costRelative,r){
 const profile=profileById(participant.profileId,config.profiles||PROFILE_MIX);
 const monthly=config.activity.actionsPerActiveMonth*profile.activity;
 const daily=monthly/30*config.participants.activeShare;
 const elastic=config.demand.mode==='behavioral'?Math.exp(-config.activity.feeElasticity*Math.max(0,costRelative)):1;
 return r()<clamp(daily*elastic,0,.95);
}
