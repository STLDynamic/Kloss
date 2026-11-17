import test from 'node:test';
import assert from 'node:assert/strict';
import {forecast,inventory,addMovement,voidMovement,monthlyPlan,deriveArticle,validateData,parseData,validateArticle,validDate} from '../src/model.js';
const base={id:'a',number:'A',name:'Plastkloss A',dimensions:'',supplier:'',group:'',notes:'',pack:100,stock:800,stockDate:'2026-01-01',usage:140,unit:'pieces',period:'week',lead:42,buffer:14,coverage:30,movements:[],deliveries:[],plans:{}};
const m=(id,type,date,qty,from)=>({id,type,date,qty,...(from?{from}:{}),note:'',voided:false});
const p=(plans={})=>({id:'p',name:'1006',notes:'',recipe:[{articleId:'a',pieces:9}],plans});
test('whole packs and order deadline',()=>{const f=forecast(base,'2026-01-01');assert.equal(f.shortage,40);assert.equal(f.orderIn,-16);assert.equal(f.orderQty,1000);assert.equal(f.cartons,10);});
test('late delivery cannot conceal stoppage',()=>{const f=forecast({...base,deliveries:[{id:'d',date:'2026-02-15',qty:2000}]},'2026-01-01');assert.equal(f.shortage,40);assert.equal(f.status,'critical');assert.equal(f.orderQty,0);});
test('on-time delivery prevents gap and overdue delivery excluded',()=>{assert.equal(forecast({...base,deliveries:[{id:'d',date:'2026-02-10',qty:800}]},'2026-01-01').shortage,80);assert.equal(forecast({...base,deliveries:[{id:'d',date:'2025-12-31',qty:800}]},'2026-01-01').shortage,40);});
test('actual replaces estimates including today',()=>{const a={...base,movements:[m('u','usage','2026-01-03',90,'2026-01-01')]};assert.equal(inventory(a,'2026-01-03').estimated,710);assert.equal(inventory(a,'2026-01-05').estimated,690);});
test('count supersedes old usage and receipts',()=>{const a={...base,movements:[m('u','usage','2026-01-02',50,'2026-01-01'),m('r','receipt','2026-01-02',500),m('c','count','2026-01-03',400)]};assert.equal(inventory(a,'2026-01-04').ledger,400);assert.equal(inventory(a,'2026-01-04').estimated,380);});
test('usage spanning count only deducts portion after count',()=>{const a={...base,movements:[m('u','usage','2026-01-04',80,'2026-01-01'),m('c','count','2026-01-03',700)]};assert.equal(inventory(a,'2026-01-05').estimated,660);});
test('last same-day count wins and same-day receipts follow it',()=>{const a={...base,movements:[m('c','count','2026-01-02',500),m('r','receipt','2026-01-02',100),m('c2','count','2026-01-02',600)]};assert.equal(inventory(a,'2026-01-02').ledger,700);assert.equal(inventory(voidMovement(a,'c2'),'2026-01-02').ledger,600);});
test('signed corrections are reversible with audit trail',()=>{let a=addMovement(base,m('x','adjustment','2026-01-01',-30),'2026-01-01');assert.equal(inventory(a,'2026-01-01').ledger,770);a=voidMovement(a,'x');assert.equal(inventory(a,'2026-01-01').ledger,800);assert.equal(a.movements[0].voided,true);});
test('receive delivery atomically and undo restores plan',()=>{const d={id:'d',date:'2026-01-02',qty:100};const a=addMovement({...base,deliveries:[d]},{...m('r','receipt','2026-01-02',100),delivery:d},'2026-01-02');assert.equal(a.deliveries.length,0);assert.equal(inventory(a,'2026-01-02').ledger,900);assert.deepEqual(voidMovement(a,'r').deliveries,[d]);assert.throws(()=>addMovement(a,{...m('r2','receipt','2026-01-02',100),delivery:d}));});
test('overlaps, future and impossible dates rejected',()=>{assert.equal(validDate('2026-02-30'),false);assert.throws(()=>addMovement(base,m('u','usage','2026-01-03',2,'2026-01-01'),'2026-01-02'));assert.throws(()=>validateArticle({...base,movements:[m('u','usage','2026-01-03',2,'2026-01-01'),m('v','usage','2026-01-04',2,'2026-01-03')]}));});
test('1006: 2000 products times 9 blocks equals 18000',()=>{assert.equal(deriveArticle(base,[p({'2026-01':2000})]).plans['2026-01'],18000);});
test('flexible recipe sums repeated blocks and products',()=>{const first=p({'2026-01':2000});first.recipe.push({articleId:'a',pieces:1});const second={...p({'2026-01':10}),id:'p2',name:'1007'};validateData([base],[first,second]);assert.equal(deriveArticle(base,[first,second]).plans['2026-01'],20090);});
test('production overrides but preserves manual; explicit zero differs from blank',()=>{const a={...base,plans:{'2026-01':999}};assert.equal(deriveArticle(a,[p({'2026-01':0})]).plans['2026-01'],0);assert.equal(a.plans['2026-01'],999);assert.equal(deriveArticle(a,[p()]).plans['2026-01'],999);});
test('monthly actual reduces plan without double deduction',()=>{const a={...base,stock:5000,plans:{'2026-01':3100},movements:[m('u','usage','2026-01-10',1000,'2026-01-01')]};assert.equal(monthlyPlan(a,'2026-01','2026-01-11').rate,100);assert.equal(inventory(a,'2026-01-11').estimated,4000);});
test('exceeded plan uses average and warns',()=>{const a={...base,plans:{'2026-01':10},movements:[m('u','usage','2026-01-01',20,'2026-01-01')]};const plan=monthlyPlan(a,'2026-01','2026-01-02');assert.equal(plan.exceeded,true);assert.equal(plan.rate,20);});
test('zero month then production surge triggers future shortage',()=>{const a={...base,stock:100,usage:0,plans:{'2026-01':0,'2026-02':2800}};assert.equal(forecast(a,'2026-01-01').shortage,32);});
test('leap month uses 29 days',()=>{assert.equal(monthlyPlan({...base,plans:{'2024-02':2900}},'2024-02','2024-02-01').rate,100);});
test('backup round trip keeps complete state; rejects nail backup and dangling recipe',()=>{const data={app:'kloss',version:1,articles:[base],products:[p({'2026-01':2000})]};assert.deepEqual(parseData(JSON.stringify(data)),{articles:data.articles,products:data.products});assert.throws(()=>parseData(JSON.stringify({...data,app:'spik'})));assert.throws(()=>validateData([],data.products));assert.throws(()=>validateData([base,{...base,id:'b'}],[]));});

// Weekly production and shared stock regressions.
const weeklyProduct=(id,name,n,week='2026-W02',pieces=1)=>({id,name,notes:'',recipe:[{articleId:'a',pieces}],plans:{},weeklyPlans:{[week]:n}});
const weeklyArticle=(overrides={})=>({...base,stockDate:'2026-01-05',stock:70,usage:0,...overrides});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const {isoWeek,weekStart,validWeek,weeklyCoverage}=await import('../src/model.js');
test('ISO week/year and leap boundaries',()=>{
  assert.equal(isoWeek('2021-01-01'),'2020-W53');assert.equal(weekStart('2020-W53'),'2020-12-28');
  assert.equal(isoWeek('2025-12-29'),'2026-W01');assert.equal(validWeek('2021-W53'),false);
  assert.equal(isoWeek('2024-02-29'),'2024-W09');assert.equal(validWeek('garbage'),false);
});
test('shared stock is reserved once in numeric product priority',()=>{
  const products=[weeklyProduct('p5','Artikel 5',70),weeklyProduct('p2','Artikel 2',70)];
  const c=weeklyCoverage([weeklyArticle()],products,['2026-W02'],'2026-01-05');
  near(c['p2/2026-W02'].possible,40);near(c['p5/2026-W02'].possible,30);
  near(c['p2/2026-W02'].possible+c['p5/2026-W02'].possible,70);
  near(c['p2/2026-W02'].missing.a+c['p5/2026-W02'].missing.a,70);
});
test('week overrides month only on overlapping days and explicit zero differs from absent',()=>{
  const a=weeklyArticle({stockDate:'2026-01-01',stock:5000,plans:{'2026-01':310}});
  const p=weeklyProduct('p','2',0);
  near(inventory(deriveArticle(a,[p]),'2026-01-12').estimated,4960);
  near(inventory(deriveArticle(a,[{...p,weeklyPlans:{}}]),'2026-01-12').estimated,4890);
  assert.equal(a.plans['2026-01'],310);
});
test('delivery dates preserve earlier shortage, previous weeks consume later stock',()=>{
  const p=weeklyProduct('p','2',70);p.weeklyPlans['2026-W03']=70;
  const a=weeklyArticle({stock:0,deliveries:[{id:'d',date:'2026-01-08',qty:140}]});
  const c=weeklyCoverage([a],[p],['2026-W02','2026-W03'],'2026-01-05');
  near(c['p/2026-W02'].possible,40);near(c['p/2026-W02'].missing.a,30);
  near(c['p/2026-W03'].possible,70);
  const f=forecast(deriveArticle(a,[p]),'2026-01-05');assert.equal(f.shortage,0);
  const earlier=weeklyCoverage([weeklyArticle({stock:70})],[p],['2026-W03'],'2026-01-05');near(earlier['p/2026-W03'].possible,0);
});
test('weekly actual replaces estimates and latest inventory resets history',()=>{
  const p=weeklyProduct('p','2',70);
  const a=weeklyArticle({stock:100,movements:[m('u','usage','2026-01-06',20,'2026-01-05')]});
  near(inventory(deriveArticle(a,[p]),'2026-01-07').estimated,80);
  near(inventory(deriveArticle(a,[p]),'2026-01-08').estimated,70);
  a.movements.push(m('c','count','2026-01-08',90));
  near(inventory(deriveArticle(a,[p]),'2026-01-09').estimated,80);
  const c=weeklyCoverage([a],[p],['2026-W02'],'2026-01-08');near(c['p/2026-W02'].required,40);
});
test('weekly backup roundtrip and legacy backup remain compatible; malformed weekly data rejected',()=>{
  const data={app:'kloss',version:1,articles:[weeklyArticle()],products:[weeklyProduct('p','2',0)]};
  assert.deepEqual(parseData(JSON.stringify(data)).products,data.products);
  assert.deepEqual(parseData(JSON.stringify({...data,products:[p()]})).products,[p()]);
  assert.throws(()=>validateData(data.articles,[{...data.products[0],weeklyPlans:{'2021-W53':2}}]));
  assert.throws(()=>validateData(data.articles,[{...data.products[0],weeklyPlans:{'2026-W02':1.5}}]));
});
test('multiple recipe blocks bottleneck, repeated rows, unknown stock and zero production',()=>{
  const a=weeklyArticle(),b={...weeklyArticle({stock:0}),id:'b',number:'B'};
  const p=weeklyProduct('p','2',7);p.recipe.push({articleId:'a',pieces:1},{articleId:'b',pieces:1});
  let c=weeklyCoverage([a,b],[p],['2026-W02'],'2026-01-05')['p/2026-W02'];near(c.possible,0);near(c.missing.b,7);
  c=weeklyCoverage([{...a,stockDate:null},b],[p],['2026-W02'],'2026-01-05')['p/2026-W02'];assert.equal(c.unknown,true);
  c=weeklyCoverage([a,b],[{...p,weeklyPlans:{'2026-W02':0}}],['2026-W02'],'2026-01-05')['p/2026-W02'];near(c.required,0);
});
test('actual usage of one recipe component does not reserve it a second time',()=>{
  const p=weeklyProduct('p','2',70);p.recipe.push({articleId:'b',pieces:1});
  const a=weeklyArticle({stock:70,movements:[m('u','usage','2026-01-05',60,'2026-01-05')]});
  const b={...weeklyArticle({stock:70}),id:'b',number:'B'};
  const c=weeklyCoverage([a,b],[p],['2026-W02'],'2026-01-05')['p/2026-W02'];
  near(c.possible,70);near(c.required,70);assert.deepEqual(c.missing,{});
});
test('weekly purchasing demand replaces monthly production and excludes recorded actual',()=>{
 const a=weeklyArticle({stock:0,lead:0,buffer:0,coverage:7,plans:{'2026-01':31000}});
 const p=weeklyProduct('p','2',70);p.plans={'2026-01':62000};
 const derived=deriveArticle(a,[p]);near(forecast(derived,'2026-01-05').requiredQty,70);
 p.weeklyPlans['2026-W02']=0;near(forecast(deriveArticle(a,[p]),'2026-01-05').requiredQty,0);
});
