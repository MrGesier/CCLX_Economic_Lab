import {clone,defaults,PROJECTS,sum} from './model.js';
import {linearFromEconomics,powerFromEconomics,piecewiseFromEconomics} from './curve-families.js';

const priceRef={mode:'fixed',cclxUsd:.275,asOf:'2026-09-02',origin:'proposed_synthetic',description:'Fixed illustrative CCLX/USD price source. Do not combine with another active price source.'};

export const PARAMETER_REGISTER=[
 {path:'priceSource.cclxUsd',unit:'USD/CCLX',origin:'proposed_synthetic',domain:'> 0',description:'Conversion reference used only for indicative USD display and PDF floor-buffer conversion.'},
 {path:'totalInitialCapitalCCLX',unit:'CCLX',origin:'proposed_synthetic',domain:'>= 0',description:'Participant wallet capital funded externally at simulation start, separate from project reserves.'},
 {path:'totalInitialReserveBudgetCCLX',unit:'CCLX',origin:'existing_synthetic',domain:'>= 0',description:'Initial project curve reserve budget. In fixed_total_resources it is not multiplied by project count.'},
 {path:'participants.initial',unit:'participants',origin:'proposed_synthetic',domain:'integer >= 0',description:'Synthetic participant count, not an adoption estimate.'},
 {path:'activity.actionsPerActiveMonth',unit:'decisions/active participant/month',origin:'proposed_synthetic',domain:'>= 0',description:'Action frequency. Distinct from vault turnover and market velocity.'},
 {path:'activity.movableFraction',unit:'share of wallet or position',origin:'proposed_synthetic',domain:'0..1',description:'Maximum fraction moved by a participant in one decision.'},
 {path:'activity.feeElasticity',unit:'dimensionless',origin:'proposed_synthetic',domain:'>= 0',description:'Behavioral demand intensity multiplier exp(-epsilon * relative cost).'},
 {path:'fees.defaultMintFee',unit:'fraction of gross deposit',origin:'existing_synthetic/proposed_synthetic',domain:'0..1',description:'Curve entry fee before per-project overrides.'},
 {path:'fees.defaultRedemptionFee',unit:'fraction of gross redemption',origin:'existing_synthetic/proposed_synthetic',domain:'0..1',description:'Curve exit fee before per-project overrides.'},
 {path:'fees.routingFee',unit:'fraction of migration proceeds',origin:'proposed_synthetic',domain:'0..1',description:'Optional migration routing fee, disabled by default.'},
 {path:'project.curve.family',unit:'enum',origin:'existing_synthetic/proposed_synthetic',domain:'linear|power|piecewise|milestone_steps',description:'Bonding-curve family. Milestone presets are not claimed to reproduce the PDF unless piecewise steps are selected.'}
];

export const CURVE_LAB_SCENARIOS=[
 {id:'no_flow',name:'Aucun flux',description:'Aucune action participant : les frais de courbe doivent rester nuls.',changes:{activity:{actionsPerActiveMonth:0},participants:{newPerDay:0}}},
 {id:'organic_growth',name:'Croissance organique',description:'Entrants avec budgets CCLX explicites et demande comportementale.',changes:{participants:{newPerDay:4,budgetPerNewParticipantCCLX:1200},demand:{mode:'behavioral'}}},
 {id:'intense_rebalance',name:'Rééquilibrage intense sans capital neuf',description:'Rotation et migrations sans apport externe récurrent.',changes:{activity:{actionsPerActiveMonth:4,migrationProbability:.55,withdrawProbability:.18,depositProbability:.22},participants:{newPerDay:0}}},
 {id:'small_fast_vs_large_slow',name:'Petits tickets rapides',description:'Tickets plus petits, fréquence plus forte.',changes:{activity:{actionsPerActiveMonth:5,movableFraction:.08},capital:{medianTicketCCLX:450,dispersion:.65}}},
 {id:'fragmentation_fixed_total',name:'Plus de projets, ressources constantes',description:'Compare 2, 3, 5, 10 projets sans multiplier capital, population ni budget de réserves.',changes:{networkMode:'fixed_total_resources',projectSchedule:[{day:0,targetActiveProjects:2},{day:120,targetActiveProjects:3},{day:240,targetActiveProjects:5},{day:365,targetActiveProjects:10}]}},
 {id:'growth_funded',name:'Projets financés explicitement',description:'Les nouveaux floor buffers, participants et capitaux sont financés explicitement.',changes:{networkMode:'fixed_per_project_resources',participants:{newPerDay:6,budgetPerNewParticipantCCLX:1500}}},
 {id:'whale_exit',name:'Sortie whale corrélée',description:'Une vague de retraits teste la capacité de sortie.',changes:{activity:{whaleExitDay:180,whaleExitShare:.65,withdrawProbability:.32,migrationProbability:.2}}},
 {id:'new_project_migration',name:'Projet attractif sans apports',description:'Le nouveau projet capte des migrations ; l’attribution incrémental/cannibalisé reste séparée.',changes:{participants:{newPerDay:0},demand:{noveltyBoost:.45}}},
 {id:'capacity_saturation',name:'Capacités saturées',description:'Demandes de dépôt fortes et refus/partiels visibles.',changes:{activity:{actionsPerActiveMonth:3,depositProbability:.72,withdrawProbability:.05,migrationProbability:.1},capital:{medianTicketCCLX:2500}}},
 {id:'fee_elasticity',name:'Frais élevés et demande élastique',description:'Hausse des frais comparée à la demande imposée.',changes:{fees:{defaultMintFee:.025,defaultRedemptionFee:.035},activity:{feeElasticity:2.2}}},
 {id:'cclx_down',name:'Baisse du prix CCLX',description:'Quantités de frais versus valorisation USD indicative, sans cash réalisé automatique.',changes:{pricePath:{mode:'synthetic',shockDay:120,shockPct:-.45}}},
 {id:'restricted_tokens',name:'Tokens restreints',description:'Provenance conservée sur dépôts, retraits, frais et rewards.',changes:{restrictedShare:.2}},
 {id:'subsidized_rotation',name:'Rotation subventionnée',description:'Frais bruts élevés mais résultat net faible après coûts/subventions.',changes:{fees:{subsidyPerActionCCLX:18},activity:{actionsPerActiveMonth:4}}},
 {id:'pipeline_fixed',name:'Pipeline 2→3→5→10 constant',description:'Fragmentation, cannibalisation et concentration à ressources totales constantes.',changes:{networkMode:'fixed_total_resources',projectSchedule:[{day:0,targetActiveProjects:2},{day:180,targetActiveProjects:3},{day:365,targetActiveProjects:5},{day:730,targetActiveProjects:10}],horizonDays:1095}},
 {id:'pipeline_funded',name:'Pipeline financé explicitement',description:'Même pipeline avec capitaux et floor buffers additionnels documentés.',changes:{networkMode:'fixed_per_project_resources',projectSchedule:[{day:0,targetActiveProjects:2},{day:180,targetActiveProjects:3},{day:365,targetActiveProjects:5},{day:730,targetActiveProjects:10}],horizonDays:1095,participants:{newPerDay:5,budgetPerNewParticipantCCLX:1400}}},
 {id:'too_fast',name:'Créations trop rapides',description:'Courbes dormantes, coûts fixes et faible remplissage.',changes:{projectSchedule:[{day:0,targetActiveProjects:2},{day:30,targetActiveProjects:5},{day:90,targetActiveProjects:10}],costs:{onboardingUSD:45000,projectDailyUSD:180}}},
 {id:'too_slow',name:'Créations trop lentes',description:'Saturation, refus et opportunité perdue.',changes:{projectSchedule:[{day:0,targetActiveProjects:2},{day:365,targetActiveProjects:3},{day:730,targetActiveProjects:5}],activity:{depositProbability:.65}}},
 {id:'star_project',name:'Arrivée projet vedette',description:'Sépare nouveaux dépôts et migrations depuis les courbes existantes.',changes:{demand:{noveltyBoost:.7,starProjectDay:240}}},
 {id:'simultaneous_maturity',name:'Maturités simultanées',description:'Règles de fermeture, capacité de sortie et frais sans double compte.',changes:{maturityWaveDay:300,activity:{withdrawProbability:.45}}}
];

export function existingProjectToCurveLab(p,i=0){
 return {
  id:p.id,name:p.name,type:p.type,origin:'existing_synthetic',documentStatus:'Code baseline: collateral vault receipt, not a project-financing right.',
  createdDay:0,openDay:0,fundraisingEndDay:120,operatingDay:0,maturityDay:1095+i*90,closeDay:null,defaultDay:null,
  floorBuffer:{value:p.collateral,currency:'CCLX',source:'existing_synthetic',origin:'existing_synthetic',description:'Existing code collateral reserve.'},
  capacityCCLX:p.capacity,attractiveness:p.quality,quality:p.quality,whalePreference:i===0?1.15:1,
  curve:{family:'linear',a:p.curveA,b:p.curveB,initialPrice:p.curveA,priceAtCapacity:p.curveA+p.curveB*p.capacity,capacity:p.capacity,origin:'existing_synthetic'},
  fees:{mintFee:p.curveFee,redemptionFee:p.curveFee,origin:'existing_synthetic'},
  costs:{onboardingUSD:0,dailyUSD:p.annualCosts/365,origin:'existing_synthetic'},
  externalFees:{annualProtocolFeesUSD:p.annualProtocolFees,classification:'external_only',origin:'existing_synthetic'}
 };
}

export function condensedV5Projects(){
 const rows=[
  ['forest_v5','Forest Restoration','forest',1000000,.85,.010,.020,1.25],
  ['industrial_v5','Industrial Decarbonization','industrial',2000000,1.15,.015,.025,1.50],
  ['mangrove_v5','Mangrove Protection','mangrove',750000,.65,.008,.018,1.10]
 ];
 return rows.map(([id,name,type,floorUSD,slope,mintFee,redemptionFee,rewardMultiplier],i)=>{
  const reserveCCLX=floorUSD/priceRef.cclxUsd,capacity=reserveCCLX*4;
  return {
   id,name,type,origin:'condensed_v5',documentStatus:'Prepared for client discussion; illustrative, not legally approved.',
   createdDay:i*180,openDay:i*180+30,fundraisingEndDay:i*180+180,operatingDay:i*180+240,maturityDay:i*180+1095,closeDay:null,defaultDay:null,
   floorBuffer:{value:floorUSD,currency:'USD',convertedCCLX:reserveCCLX,source:'external',origin:'condensed_v5',conversion:{priceCCLXUSD:priceRef.cclxUsd,asOf:priceRef.asOf}},
   capacityCCLX:capacity,attractiveness:1+i*.04,quality:1,rewardMultiplier,
   curve:{family:'milestone_steps',initialPrice:1,priceAtCapacity:1+slope,capacity,segments:[{supply:0,price:1},{supply:capacity*.33,price:1+slope*.35},{supply:capacity*.67,price:1+slope*.72},{supply:capacity,price:1+slope}],origin:'condensed_v5'},
   fees:{mintFee,redemptionFee,origin:'condensed_v5'},
   costs:{onboardingUSD:0,dailyUSD:0,origin:'unconfirmed'},
   externalFees:{annualProtocolFeesUSD:0,classification:'unconfirmed',origin:'unconfirmed'}
  };
 });
}

export function demoScenario(){
 return {
  id:'pdf_demo_split',
  name:'PDF demo split 10,000 CCLX',
  origin:'condensed_v5',
  description:'10,000 CCLX split 60% Project A / 40% Project B; real yield and bootstrap reward remain separate demonstration values.',
  allocations:[{projectId:'forest_v5',amountCCLX:6000,realYield:.07,bootstrapReward:.042},{projectId:'industrial_v5',amountCCLX:4000,realYield:.038,bootstrapReward:.046}]
 };
}

export function defaultCurveLabConfig(base=defaults()){
 const projects=base.projects.map(existingProjectToCurveLab);
 return {
  schemaVersion:'curve-sim/1.0',preset:'existing_baseline',mode:'collateral_vault',projectFinancing:{enabled:false,status:'not_implemented',reason:'Experimental project-financing mode would need deployed capital, NAV, haircuts, delay queues and defaults; controls remain disabled.'},
  seed:20260902,horizonDays:365,networkMode:'fixed_network',priceSource:clone(priceRef),
  totalInitialCapitalCCLX:10000000,totalInitialParticipants:1000,totalInitialReserveBudgetCCLX:sum(projects.map(p=>p.floorBuffer.value)),
  participants:{initial:1000,newPerDay:0,budgetPerNewParticipantCCLX:1000,activeShare:.30,attritionMonthly:.02,reactivationMonthly:.005,adoptionCap:5000},
  capital:{medianTicketCCLX:1000,dispersion:.85,whaleShare:.04,whaleWealthShare:.38,individualCapCCLX:250000},
  activity:{actionsPerActiveMonth:1,movableFraction:.20,depositProbability:.45,withdrawProbability:.18,migrationProbability:.27,holdProbability:.10,feeElasticity:1.0,slippageElasticity:1.0,maxSlippage:.08,minOrderCCLX:10,cooldownDays:0,whaleExitDay:null,whaleExitShare:0},
  demand:{mode:'behavioral',noveltyBoost:.15,diversificationPreference:.30,cannibalization:.45,inertia:.35,starProjectDay:null},
  fees:{defaultMintFee:.002,defaultRedemptionFee:.002,routingFee:0,subsidyPerActionCCLX:0,allocations:{rewards:.25,reserve:.15,lp:.10,operations:.25}},
  costs:{networkDailyUSD:0,onboardingUSD:0,projectDailyUSD:0},
  pricePath:{mode:'fixed',shockDay:null,shockPct:0},
  restrictedShare:0,
  projectSchedule:[{day:0,targetActiveProjects:3}],
  scenarios:CURVE_LAB_SCENARIOS.map(s=>s.id),
  demoScenarios:[demoScenario()],
  parameterRegister:clone(PARAMETER_REGISTER),
  projects
 };
}

export function condensedV5Config(base=defaults()){
 const cfg=defaultCurveLabConfig(base);
 cfg.preset='condensed_v5';cfg.networkMode='fixed_total_resources';cfg.horizonDays=1095;
 cfg.projects=condensedV5Projects();cfg.totalInitialReserveBudgetCCLX=sum(cfg.projects.map(p=>p.floorBuffer.convertedCCLX));
 cfg.projectSchedule=[{day:0,targetActiveProjects:2},{day:180,targetActiveProjects:3},{day:365,targetActiveProjects:5},{day:730,targetActiveProjects:10}];
 cfg.totalInitialCapitalCCLX=10000000;cfg.totalInitialParticipants=1000;
 return cfg;
}

export function curveForProject(p){
 if(p.curve.family==='linear'&&Number.isFinite(p.curve.a)&&Number.isFinite(p.curve.b))return {family:'linear',a:p.curve.a,b:p.curve.b,capacity:p.capacityCCLX};
 if(p.curve.family==='power')return powerFromEconomics({initialPrice:p.curve.initialPrice,priceAtReference:p.curve.priceAtReference||p.curve.priceAtCapacity,referenceSupply:p.capacityCCLX,convexity:p.curve.convexity});
 if(p.curve.family==='piecewise'||p.curve.family==='milestone_steps')return piecewiseFromEconomics({initialPrice:p.curve.initialPrice,capacity:p.capacityCCLX,segments:p.curve.segments});
 return linearFromEconomics({initialPrice:p.curve.initialPrice,priceAtCapacity:p.curve.priceAtCapacity,capacity:p.capacityCCLX});
}

export function mergeCurveLabConfig(config,changes={}){
 const out=clone(config);
 const merge=(target,src)=>{for(const [k,v] of Object.entries(src||{})){if(v&&typeof v==='object'&&!Array.isArray(v)&&target[k]&&typeof target[k]==='object'&&!Array.isArray(target[k]))merge(target[k],v);else target[k]=clone(v);}};
 merge(out,changes);
 return out;
}

export function validateCurveConfig(config){
 const e=[],n=(v,path,min=0,max=Infinity)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)e.push(`${path} must be finite in [${min}, ${max}].`);};
 if(config.schemaVersion!=='curve-sim/1.0')e.push('Unsupported curve simulation schema.');
 if(!['collateral_vault','project_financing'].includes(config.mode))e.push('Unsupported economic mode.');
 if(config.mode==='project_financing'&&!config.projectFinancing?.enabled)e.push('Project financing mode is documented but disabled until NAV, haircuts, delay queues and losses are modeled.');
 n(config.horizonDays,'horizonDays',1,3650);n(config.seed,'seed',0,2**32-1);n(config.priceSource?.cclxUsd,'priceSource.cclxUsd',1e-9);
 n(config.totalInitialCapitalCCLX,'totalInitialCapitalCCLX');n(config.totalInitialParticipants,'totalInitialParticipants');n(config.totalInitialReserveBudgetCCLX,'totalInitialReserveBudgetCCLX');
 for(const k of ['initial','newPerDay','budgetPerNewParticipantCCLX','activeShare','attritionMonthly','reactivationMonthly','adoptionCap'])n(config.participants[k],'participants.'+k,0,k==='activeShare'||k.endsWith('Monthly')?1:Infinity);
 for(const k of ['medianTicketCCLX','dispersion','whaleShare','whaleWealthShare','individualCapCCLX'])n(config.capital[k],'capital.'+k,0,k.includes('Share')?1:Infinity);
 const a=config.activity;for(const k of ['actionsPerActiveMonth','movableFraction','depositProbability','withdrawProbability','migrationProbability','holdProbability','feeElasticity','slippageElasticity','maxSlippage','minOrderCCLX','cooldownDays'])n(a[k],'activity.'+k,0,k.includes('Probability')||k==='movableFraction'||k==='maxSlippage'?1:Infinity);
 if(a.depositProbability+a.withdrawProbability+a.migrationProbability+a.holdProbability>1+1e-8)e.push('Activity probabilities must sum to <= 1.');
 for(const k of ['defaultMintFee','defaultRedemptionFee','routingFee','subsidyPerActionCCLX'])n(config.fees[k],'fees.'+k,0,k.includes('Fee')?1:Infinity);
 if(sum(Object.values(config.fees.allocations))>1+1e-8)e.push('Fee allocations must be <= 100%.');
 const ids=new Set();
 for(const [i,p] of config.projects.entries()){
  if(ids.has(p.id))e.push('Duplicate curve project id: '+p.id);ids.add(p.id);
  for(const k of ['createdDay','openDay','capacityCCLX','attractiveness','quality'])n(p[k],`projects.${i}.${k}`,0);
  if(p.openDay<p.createdDay)e.push(`${p.id}: openDay cannot precede createdDay.`);
  if(p.floorBuffer.currency==='USD'&&!p.floorBuffer.convertedCCLX)e.push(`${p.id}: USD floor requires explicit convertedCCLX.`);
  const reserve=p.floorBuffer.currency==='USD'?p.floorBuffer.convertedCCLX:p.floorBuffer.value;n(reserve,`${p.id}.floorBuffer`,0);if(reserve>p.capacityCCLX+1e-8)e.push(`${p.id}: floor buffer exceeds CCLX capacity.`);
  n(p.fees.mintFee,`${p.id}.fees.mintFee`,0,1);n(p.fees.redemptionFee,`${p.id}.fees.redemptionFee`,0,1);
  try{const curve=curveForProject(p);n(curveForProject(p).capacity||p.capacityCCLX,`${p.id}.curve.capacity`,1);if(curve.family==='linear'){n(curve.a,`${p.id}.curve.a`,1e-9);n(curve.b,`${p.id}.curve.b`,0);} }catch(err){e.push(`${p.id}: ${err.message}`);}
 }
 if(config.networkMode==='fixed_total_resources'&&config.projectSchedule?.length){
  const maxTarget=Math.max(...config.projectSchedule.map(x=>x.targetActiveProjects||0));
  if(maxTarget>config.projects.length&&config.totalInitialReserveBudgetCCLX<=0)e.push('Dynamic fixed_total_resources needs a positive reserve budget or funded zero-reserve projects.');
 }
 return e;
}
