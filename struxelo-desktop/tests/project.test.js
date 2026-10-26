import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {demo,clone,validateProject,day,iso,cpm,metrics,matching,importSchedule,exportCsv} from '../src/project.js';

test('demo survives JSON round-trip and validation',()=>assert.equal(validateProject(JSON.parse(JSON.stringify(demo()))).tasks.length,10));
test('date parsing rejects normalized invalid dates and keeps leap days',()=>{assert.throws(()=>day('2026-02-30'));assert.equal(iso(day('2024-02-29')),'2024-02-29');});
test('CPM calculates a branching network and float using FS calendar-day semantics',()=>{
  const p=demo();const make=(id,duration,pred=[])=>({...p.tasks[0],id,start:'2026-01-01',finish:iso(day('2026-01-01')+duration),predecessors:pred.map(id=>({id,type:'FS',lag:0}))});
  const tasks=cpm([make('A',4),make('B',3,['A']),make('C',1,['A']),make('D',2,['B','C'])],'2026-01-01');
  assert.equal(tasks[3].start,'2026-01-08');assert.equal(tasks[3].finish,'2026-01-10');assert.equal(tasks[2].totalFloat,2);assert.equal(tasks[2].critical,false);assert.equal(tasks[0].critical,true);
});
test('CPM rejects cycles and unsupported relationships without changing input',()=>{
  const tasks=demo().tasks;tasks[0].predecessors=[{id:'T10',type:'FS',lag:0}];assert.throws(()=>cpm(tasks,'2026-01-01'),/cycle/);
  const p=demo();p.tasks[1].predecessors[0].type='SS';const before=JSON.stringify(p);assert.throws(()=>cpm(p.tasks,'2026-01-01'),/finish-to-start/);assert.equal(JSON.stringify(p),before);
});
test('project validation rejects dangling assignments, negative cost and duplicate IDs',()=>{
  let p=demo();p.parts[0].taskId='missing';assert.throws(()=>validateProject(p));
  p=demo();p.tasks[0].actualCost=-1;assert.throws(()=>validateProject(p));
  p=demo();p.tasks[1].id=p.tasks[0].id;assert.throws(()=>validateProject(p));
});
test('automatic assignments exclude ambiguity, assigned parts and short codes',()=>{
  const p=demo();p.parts[0].taskId=null;assert.equal(matching(p).length,1);
  p.tasks[1].code=p.tasks[0].code;assert.equal(matching(p).length,0);
  p.tasks[0].code='T';p.tasks[1].code='xx';assert.equal(matching(p).length,0);
});
test('earned value uses physical percentage and excludes summary rows',()=>{
  const p=demo();p.baseline=null;p.tasks=[{...p.tasks[0],budget:1000,actualCost:600,progress:50,start:'2026-01-01',finish:'2026-01-11'},{...p.tasks[0],id:'S',summary:true,budget:9000}];
  const m=metrics(p,day('2026-01-06'));assert.equal(m.earned,500);assert.equal(m.planned,500);assert.equal(m.budget,1000);assert.equal(m.cpi,500/600);
});
test('CSV handles quoted commas and protects spreadsheet formula exports',()=>{
  const p=importSchedule('id,name,start,finish,progress,budget\nA,"Deck, east",2026-01-01,2026-01-02,10,500\n','test.csv');assert.equal(p.tasks[0].name,'Deck, east');
  p.tasks[0].name='=1+2';assert.match(exportCsv(p.tasks),/"'=1\+2"/);
  assert.throws(()=>importSchedule('name,start,finish\nA,2026-01-01,2026-01-02','missing.csv'),/id column/);
});
test('XML rejects entities, malformed input and multi-project P6 documents',()=>{
  assert.throws(()=>importSchedule('<!DOCTYPE foo><Project/>','x.xml'),/DTD/);
  assert.throws(()=>importSchedule('<Project>','x.xml'),/Invalid/);
  assert.throws(()=>importSchedule('<APIBusinessObjects><Project/><Project/></APIBusinessObjects>','x.xml'),/one P6 project/);
});
for(const [name,expected] of [['P6',95],['MSP',118]])test(`official Bentley ${name} training XML imports real tasks and links`,()=>{
  const source=readFileSync(new URL(`../research/samples/Training Project Schedule_${name}.xml`,import.meta.url),'utf8');
  const p=importSchedule(source,`${name}.xml`);assert.equal(p.tasks.length,expected);assert.ok(p.tasks.some(t=>t.predecessors.length));assert.ok(p.warnings.length);validateProject(p);
  if(name==='P6'){assert.equal(p.unresolvedDependencies.length,3);assert.equal(p.tasks.flatMap(t=>t.predecessors).length,155);}
});
