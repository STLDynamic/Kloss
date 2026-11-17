const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const {today,isoWeek,dateAfter,weekStart}=await import('../src/model.js');
 const date=today(),week=isoWeek(date),nextWeek=isoWeek(dateAfter(weekStart(week),7));
 const a={id:'a',number:'A',name:'Plastkloss A',dimensions:'',supplier:'',group:'',notes:'',pack:100,stock:70,stockDate:date,usage:0,unit:'pieces',period:'week',lead:42,buffer:14,coverage:30,movements:[],deliveries:[],plans:{[date.slice(0,7)]:310}};
 const product=(id,name)=>({id,name,notes:'',recipe:[{articleId:'a',pieces:1}],plans:{[date.slice(0,7)]:100}});
 const legacy={app:'kloss',version:1,articles:[a],products:[product('p5','Artikel 5'),product('p2','Artikel 2')]};
 await page.goto('http://127.0.0.1:3000');
 await page.evaluate(data=>localStorage.setItem('kloss.inventory.v1',JSON.stringify(data)),legacy);await page.reload();
 assert.equal(await page.locator('#calendar-view').isVisible(),true);
 assert.match(await page.locator('#week-rows tr').first().innerText(),/Artikel 2/);
 const input=(p,w)=>page.locator(`#week-rows input[data-product="${p}"][data-week="${w}"]`);
 await input('p2',nextWeek).fill('70');await input('p2',nextWeek).press('Tab');
 await input('p5',nextWeek).fill('70');await input('p5',nextWeek).press('Tab');
 assert.equal(await page.locator('#week-rows .coverage').count(),2);
 assert.match(await page.locator('#week-rows').innerText(),/Saknas: A/);
 await page.reload();assert.equal(await input('p2',nextWeek).inputValue(),'70');
 await input('p2',week).fill('0');await input('p2',week).press('Tab');assert.match(await page.locator('#week-rows').innerText(),/Ingen produktion/);
 await input('p2',week).fill('');await input('p2',week).press('Tab');
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('kloss.inventory.v1')));
 assert.equal(Object.hasOwn(stored.products.find(p=>p.id==='p2').weeklyPlans,week),false);
 assert.deepEqual(stored.articles,legacy.articles);assert.deepEqual(stored.products.map(p=>p.plans),legacy.products.map(p=>p.plans));
 // Editing the recipe must preserve weekly and monthly production.
 await page.locator('[data-recipe="p2"]').click();await page.getByRole('button',{name:'Spara produkt',exact:true}).click();
 await page.reload();assert.equal(await input('p2',nextWeek).inputValue(),'70');
 // ISO year navigation and quick return.
 await page.locator('#week-start').fill('2020-W53');await page.locator('#week-start').press('Tab');
 assert.match(await page.locator('#week-head').innerText(),/Vecka 53 · 2020/);assert.match(await page.locator('#week-head').innerText(),/Vecka 1 · 2021/);
 await page.locator('#week-next').click();await page.locator('#week-prev').click();assert.equal(await page.locator('#week-start').inputValue(),'2020-W53');
 await page.locator('#week-today').click();assert.equal(await page.locator('#week-start').inputValue(),week);
 // Full backup export/import including new plans.
 const pending=page.waitForEvent('download');await page.locator('#calendar-export').click();const download=await pending;const backup=await download.path();
 await page.evaluate(()=>localStorage.removeItem('kloss.inventory.v1'));await page.reload();await page.locator('#file').setInputFiles(backup);
 assert.equal(await input('p2',nextWeek).inputValue(),'70');
 await page.screenshot({path:'/tmp/kloss-weekly-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const wrap=page.locator('#calendar-view .table-wrap');const first=page.locator('#week-rows tr').first().locator('td').first();
 const before=await first.boundingBox();await wrap.evaluate(el=>el.scrollLeft=500);const after=await first.boundingBox();assert.ok(Math.abs(before.x-after.x)<2);
 await wrap.evaluate(el=>el.scrollLeft=0);await input('p2',week).fill('0');await input('p2',week).press('Tab');await page.reload();assert.equal(await input('p2',week).inputValue(),'0');
 await page.screenshot({path:'/tmp/kloss-weekly-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS: weekly editing, persistence, legacy data, recipe preservation, ISO navigation, JSON backup roundtrip, mobile editing and sticky product column');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
