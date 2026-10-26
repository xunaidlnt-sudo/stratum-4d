import { XMLParser, XMLValidator } from 'fast-xml-parser';

export const DAY = 86400000;
export const day = value => {
  const text=String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('Use an ISO date: YYYY-MM-DD.');
  const n=Date.parse(text+'T00:00:00Z');
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0,10)!==text) throw new Error('Invalid calendar date.');
  return n/DAY;
};
export const iso = n => new Date(n*DAY).toISOString().slice(0,10);
export const addDays = (date,n) => iso(day(date)+n);
export const clone = value => JSON.parse(JSON.stringify(value));
export function validateProject(p) {
  if(!p || p.schema!==1 || typeof p.name!=='string' || !Array.isArray(p.tasks) || !Array.isArray(p.parts)) throw new Error('This is not a Struxelo project (schema 1).');
  if(p.tasks.length>10000 || p.parts.length>20000) throw new Error('This prototype supports up to 10,000 tasks and 20,000 model parts.');
  const ids=new Set();
  for(const t of p.tasks){
    if(typeof t.id!=='string'||!t.id||ids.has(t.id)) throw new Error('Task IDs must be nonempty and unique.');
    ids.add(t.id);
    if(typeof t.name!=='string'||typeof t.wbs!=='string')throw new Error('Task names and WBS must be text.');
    if(day(t.finish)<day(t.start))throw new Error(`Finish precedes start: ${t.name}`);
    for(const k of ['progress','budget','actualCost'])if(typeof t[k]!=='number'||!Number.isFinite(t[k])||t[k]<0)throw new Error(`Invalid ${k}: ${t.name}`);
    if(t.progress>100)throw new Error('Progress must be between 0 and 100.');
    if(!Array.isArray(t.predecessors)||!t.predecessors.every(x=>typeof x.id==='string'&&['FS','SS','FF','SF'].includes(x.type)&&Number.isFinite(x.lag)))throw new Error('Invalid task dependencies.');
  }
  for(const t of p.tasks)for(const pred of t.predecessors)if(!ids.has(pred.id)||pred.id===t.id)throw new Error(`Invalid dependency for ${t.id}: ${pred.id}`);
  const partIds=new Set();
  for(const part of p.parts){
    if(typeof part.id!=='string'||partIds.has(part.id)||typeof part.name!=='string')throw new Error('Model part IDs must be unique.');
    partIds.add(part.id);
    if(part.taskId!==null&&!ids.has(part.taskId))throw new Error('A model part refers to a missing task.');
    for(const k of ['position','size'])if(!Array.isArray(part[k])||part[k].length!==3||!part[k].every(Number.isFinite))throw new Error('Invalid model geometry.');
    if(part.size.some(n=>n<=0))throw new Error('Model dimensions must be positive.');
  }
  if(p.baseline!=null){
    if(typeof p.baseline!=='object'||Array.isArray(p.baseline))throw new Error('Invalid baseline.');
    for(const b of Object.values(p.baseline))if(!b||day(b.finish)<day(b.start))throw new Error('Invalid baseline dates.');
  }
  if(p.modelAsset!=null&&(typeof p.modelAsset!=='string'||!/^data:application\/octet-stream;base64,[A-Za-z0-9+/=]+$/.test(p.modelAsset)||p.modelAsset.length>36000000))throw new Error('Invalid embedded GLB asset.');
  topological(p.tasks);
  return p;
}

export function topological(tasks) {
  const map=new Map(tasks.map(t=>[t.id,t])),visiting=new Set(),done=new Set(),order=[];
  function visit(t){
    if(done.has(t.id))return;
    if(visiting.has(t.id))throw new Error('Dependencies contain a cycle. Remove the circular link.');
    visiting.add(t.id);
    for(const p of t.predecessors){const source=map.get(p.id);if(!source)throw new Error(`Missing predecessor ${p.id}`);visit(source);}
    visiting.delete(t.id);done.add(t.id);order.push(t);
  }
  tasks.forEach(visit);return order;
}

// Explicitly limited engine: calendar days and finish-to-start links only.
// Imported dates remain unchanged until the user requests recalculation.
export function cpm(tasks, startDate) {
  if(tasks.some(t=>t.summary||t.predecessors.some(p=>p.type!=='FS')))throw new Error('Recalculation currently supports flat tasks and finish-to-start links only. Imported dates are preserved.');
  const order=topological(tasks),results=new Map(),origin=day(startDate);
  for(const t of order){
    const duration=Math.max(0,day(t.finish)-day(t.start));
    const es=Math.max(origin,...t.predecessors.map(p=>results.get(p.id).ef+p.lag));
    results.set(t.id,{es,ef:es+duration,duration});
  }
  const end=Math.max(origin,...[...results.values()].map(r=>r.ef));
  const successors=new Map(tasks.map(t=>[t.id,[]]));
  for(const t of tasks)for(const p of t.predecessors)successors.get(p.id).push({id:t.id,lag:p.lag});
  for(const t of [...order].reverse()){
    const r=results.get(t.id),next=successors.get(t.id);
    r.lf=next.length?Math.min(...next.map(s=>results.get(s.id).ls-s.lag)):end;
    r.ls=r.lf-r.duration;r.float=r.ls-r.es;r.critical=Math.abs(r.float)<1e-8;
  }
  return tasks.map(t=>({...t,start:iso(results.get(t.id).es),finish:iso(results.get(t.id).ef),critical:results.get(t.id).critical,totalFloat:results.get(t.id).float}));
}

export function range(tasks){
  if(!tasks.length){const start=day(new Date().toISOString().slice(0,10));return {start,end:start+30};}
  const start=Math.min(...tasks.map(t=>day(t.start))),end=Math.max(start+1,...tasks.map(t=>day(t.finish)));
  return {start,end};
}
export function metrics(p,at){
  let budget=0,earned=0,planned=0,actual=0;
  for(const t of p.tasks.filter(t=>!t.summary)){
    budget+=t.budget;actual+=t.actualCost;earned+=t.budget*t.progress/100;
    const base=p.baseline?.[t.id]??t,s=day(base.start),f=day(base.finish);
    planned+=t.budget*(f===s?(at>=f?1:0):Math.max(0,Math.min(1,(at-s)/(f-s))));
  }
  return {budget,earned,planned,actual,cpi:actual?earned/actual:null,spi:planned?earned/planned:null};
}
export function matching(p,needleField='code'){
  const pairs=[];
  for(const part of p.parts.filter(p=>!p.taskId)){
    const text=part.name.toLowerCase();
    const candidates=p.tasks.filter(t=>!t.summary&&String(t[needleField]??'').trim().length>=3&&text.includes(String(t[needleField]).trim().toLowerCase()));
    if(candidates.length===1)pairs.push({partId:part.id,taskId:candidates[0].id});
  }
  return pairs;
}

const arr=v=>v==null?[]:Array.isArray(v)?v:[v];
const date=v=>String(v??'').slice(0,10);
const num=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const text=v=>String(v??'');
function makeTask(v){return {id:text(v.id),name:text(v.name),wbs:text(v.wbs),code:text(v.code??v.id),start:date(v.start),finish:date(v.finish),progress:num(v.progress),budget:num(v.budget),actualCost:num(v.actualCost),predecessors:v.predecessors??[],summary:!!v.summary,critical:!!v.critical};}
function parseCsv(source){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<source.length;i++){
    const c=source[i];
    if(c==='"'){if(quoted&&source[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&source[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(quoted)throw new Error('CSV contains an unclosed quoted field.');
  row.push(field);if(row.some(Boolean))rows.push(row);
  const headers=rows.shift()?.map(h=>h.trim())??[];
  for(const key of ['id','name','start','finish'])if(!headers.includes(key))throw new Error(`CSV needs a ${key} column.`);
  return rows.map(r=>makeTask(Object.fromEntries(headers.map((h,i)=>[h,r[i]??'']))));
}
export function importSchedule(source,filename){
  if(source.length>30_000_000)throw new Error('Schedule exceeds the 30 MB import limit.');
  const warnings=[],unresolvedDependencies=[];let tasks,name=filename;
  if(filename.toLowerCase().endsWith('.csv')){tasks=parseCsv(source);warnings.push('CSV dates and costs imported; dependencies require the task editor.');}
  else {
    if(/<!DOCTYPE|<!ENTITY/i.test(source))throw new Error('DTD and external entities are not supported.');
    const valid=XMLValidator.validate(source);if(valid!==true)throw new Error('Invalid schedule XML.');
    const doc=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false}).parse(source);
    if(doc.Project?.Tasks){
      const project=doc.Project;name=text(project.Name)||filename;
      tasks=arr(project.Tasks.Task).filter(t=>text(t.UID)!=='0'&&text(t.IsNull)!=='1').map(t=>makeTask({id:text(t.UID),name:t.Name,wbs:t.WBS,code:t.ID,start:t.Start,finish:t.Finish,progress:t.PercentComplete,budget:t.Cost,actualCost:t.ActualCost,summary:text(t.Summary)==='1',critical:text(t.Critical)==='1',predecessors:arr(t.PredecessorLink).map(p=>({id:text(p.PredecessorUID),type:({0:'FF',1:'FS',2:'SF',3:'SS'})[num(p.Type)]??'FS',lag:num(p.LinkLag)/4800}))}));
      warnings.push('MS Project XML: dates, summary rows, progress, costs and links imported. Calendars, time-of-day, constraints and resource assignments are not evaluated. Link lag uses an 8-hour-day approximation.');
    }else if(doc.APIBusinessObjects?.Project){
      const projects=arr(doc.APIBusinessObjects.Project);if(projects.length!==1)throw new Error('Import one P6 project at a time. Multi-project XML needs an explicit selection workflow.');
      const project=projects[0];name=text(project.Name)||filename;
      const activities=arr(project.Activity),byObject=new Map(activities.map(a=>[text(a.ObjectId),text(a.Id)]));
      const allLinks=arr(project.Relationship),types={'Finish to Start':'FS','Start to Start':'SS','Finish to Finish':'FF','Start to Finish':'SF'};
      const links=allLinks.filter(l=>{
        const supported=byObject.has(text(l.PredecessorActivityObjectId))&&byObject.has(text(l.SuccessorActivityObjectId))&&types[text(l.Type)];
        if(!supported)unresolvedDependencies.push({source:'P6',objectId:text(l.ObjectId),predecessorObjectId:text(l.PredecessorActivityObjectId),successorObjectId:text(l.SuccessorActivityObjectId),type:text(l.Type),lagHours:text(l.Lag),reason:'Missing endpoint or unsupported relationship type'});
        return supported;
      });
      if(unresolvedDependencies.length)warnings.push(`${unresolvedDependencies.length} unresolved P6 relationships were retained in the project’s unresolvedDependencies collection. Their original endpoint IDs were preserved. Recalculation is blocked until these are resolved outside this prototype.`);
      const wbs=new Map(arr(project.WBS).map(w=>[text(w.ObjectId),text(w.Code||w.Name)]));
      tasks=activities.map(a=>{
        const relationships=links.filter(l=>text(l.SuccessorActivityObjectId)===text(a.ObjectId));
        for(const l of relationships)if(!byObject.has(text(l.PredecessorActivityObjectId))||!types[text(l.Type)])throw new Error('Unsupported external or unknown P6 dependency. No import was applied.');
        return makeTask({id:a.Id,name:a.Name,wbs:wbs.get(text(a.WBSObjectId))??text(a.WBSObjectId),code:a.Id,start:a.StartDate||a.PlannedStartDate,finish:a.FinishDate||a.PlannedFinishDate,progress:a.PercentComplete,budget:a.PlannedTotalCost,actualCost:a.ActualTotalCost,predecessors:relationships.map(l=>({id:byObject.get(text(l.PredecessorActivityObjectId)),type:types[text(l.Type)],lag:num(l.Lag)/8}))});
      });
      warnings.push('P6 XML: activity dates, links, WBS and progress imported. Resource assignment costs, calendars, constraints, time-of-day, actual-date semantics and multi-project relationships are not evaluated. Lag uses an 8-hour-day approximation.');
    }else throw new Error('Supported XML formats: Microsoft Project and Primavera P6.');
  }
  if(!tasks.length)throw new Error('No tasks were found.');
  const p={schema:1,name,tasks,parts:[],baseline:null,modelAsset:null,warnings,unresolvedDependencies};
  return validateProject(p);
}
export function exportCsv(tasks){
  const fields=['id','name','wbs','code','start','finish','progress','budget','actualCost'];
  const safe=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return [fields.join(','),...tasks.map(t=>fields.map(f=>safe(t[f])).join(','))].join('\r\n');
}
export function demo(){
  const defs=[['T01','Site preparation','Site',0,5,100,42000],['T02','Excavation & foundations','Foundations',5,16,100,126000],['T03','Ground floor structure','Structure',16,26,75,185000],['T04','Level 01 structure','Structure',26,36,25,175000],['T05','Level 02 structure','Structure',36,46,0,175000],['T06','Roof slab','Structure',46,52,0,95000],['T07','Building envelope','Envelope',36,57,0,240000],['T08','MEP first fix','Services',36,61,0,154000],['T09','Interior fit-out','Finishes',61,76,0,198000],['T10','Testing & handover','Close-out',76,84,0,52000]];
  const origin='2026-10-05';
  const tasks=defs.map(([id,name,wbs,s,f,progress,budget],i)=>({id,name,wbs,code:id,start:addDays(origin,s),finish:addDays(origin,f),progress,budget,actualCost:Math.round(budget*progress/100*(i%2?1.05:.96)),predecessors:i?[{id:defs[i-1][0],type:'FS',lag:0}]:[],summary:false,critical:false}));
  tasks[6].predecessors=[{id:'T04',type:'FS',lag:0}];tasks[7].predecessors=[{id:'T04',type:'FS',lag:0}];tasks[8].predecessors=[{id:'T07',type:'FS',lag:0},{id:'T08',type:'FS',lag:0}];
  const parts=[];const box=(id,name,taskId,position,size)=>parts.push({id,name,taskId,position,size});
  box('site','T01 / Site platform','T01',[0,-.6,0],[24,.6,18]);
  box('foundation','T02 / Raft foundation','T02',[0,-.15,0],[17,.8,12]);
  for(let l=0;l<4;l++){
    const taskId='T0'+(l+3);box('slab'+l,`${taskId} / Level ${l} slab`,taskId,[0,l*3.5+.5,0],[17,.35,12]);
    if(l<3)for(let x=-7;x<=7;x+=7)for(let z=-5;z<=5;z+=5)box(`column-${l}-${x}-${z}`,`${taskId} / Column ${x},${z}`,taskId,[x,l*3.5+2.2,z],[.45,3.2,.45]);
  }
  box('facade','T07 / South envelope','T07',[0,5.8,5.9],[16.8,9.6,.2]);
  box('mep','T08 / Services riser','T08',[2,5.8,0],[.8,10,.8]);
  box('fitout','T09 / Interior core','T09',[-3,5.8,0],[3,9.6,3]);
  return {schema:1,name:'Northbank · Office development',tasks,parts,modelAsset:null,baseline:Object.fromEntries(tasks.map(t=>[t.id,{start:t.start,finish:t.finish}])),warnings:[]};
}
