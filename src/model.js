export const DAY = 86400000;
export const SCHEMA_VERSION = 1;
export function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function dayNumber(date) { return Date.parse(`${date}T00:00:00Z`) / DAY; }
export function dateAfter(date, days) { return new Date((dayNumber(date) + days) * DAY).toISOString().slice(0,10); }
export function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '1900-01-01' && date <= '9999-12-31' && Number.isFinite(dayNumber(date)) && dateAfter(date,0) === date;
}
const amount = (n, positive=false) => typeof n === 'number' && Number.isFinite(n) && n >= (positive ? Number.MIN_VALUE : 0) && n <= 1e12;
function uniqueIds(list) { return list.every(x=>typeof x.id==='string' && x.id) && new Set(list.map(x=>x.id)).size === list.length; }
function validateBase(a) {
  if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !a.id || typeof a.name !== 'string' || !a.name.trim()) throw new Error('Artikeln måste ha ett ID och ett namn.');
  for (const key of ['pack','stock','usage','lead','buffer','coverage']) if (!amount(a[key])) throw new Error(`Ogiltigt värde: ${key}.`);
  if (a.pack <= 0 || a.coverage <= 0) throw new Error('Förpackningsantal och extra täckning måste vara större än noll.');
  for (const key of ['lead','buffer','coverage']) if (!Number.isInteger(a[key]) || a[key] > 3650) throw new Error('Antalet dagar måste vara ett heltal mellan 0 och 3650.');
  if (!['week','month'].includes(a.period) || a.unit!=='pieces') throw new Error('Ogiltig förbrukningsenhet.');
  for (const key of ['number','dimensions','supplier','group','notes']) if (typeof a[key] !== 'string') throw new Error('Ogiltiga artikeluppgifter.');
  if (!Array.isArray(a.deliveries) || !uniqueIds(a.deliveries)) throw new Error('Ogiltig leveranslista.');
  for (const d of a.deliveries) if (!validDate(d.date) || !amount(d.qty,true)) throw new Error('Ogiltigt leveransdatum eller mängd.');
}
export function validateArticle(a) {
  validateBase(a);
  if (a.stockDate !== null && !validDate(a.stockDate)) throw new Error('Ange ett giltigt datum för startsaldot.');
  if (!Array.isArray(a.movements) || !uniqueIds(a.movements)) throw new Error('Ogiltig lagerhistorik.');
  if (a.stockDate === null && a.movements.length) throw new Error('Bekräfta startsaldot innan du registrerar lagerrörelser.');
  for (const m of a.movements) {
    if (!['usage','receipt','count','adjustment'].includes(m.type) || !validDate(m.date) || m.date < a.stockDate || !(m.type==='adjustment' ? Number.isSafeInteger(m.qty)&&Math.abs(m.qty)<=1e12 : amount(m.qty,m.type==='receipt')) || typeof m.note !== 'string' || typeof m.voided !== 'boolean') throw new Error('Ogiltig lagerrörelse.');
    if (m.type === 'usage' && (!validDate(m.from) || m.from < a.stockDate || m.from > m.date)) throw new Error('Ogiltig förbrukningsperiod.');
    if (m.delivery && (m.type !== 'receipt' || typeof m.delivery.id !== 'string' || !validDate(m.delivery.date) || !amount(m.delivery.qty,true) || m.delivery.qty !== m.qty)) throw new Error('Ogiltig leveransreferens.');
  }
  const periods=a.movements.filter(m=>m.type==='usage'&&!m.voided).sort((a,b)=>a.from.localeCompare(b.from));
  for(let i=1;i<periods.length;i++) if(periods[i].from<=periods[i-1].date) throw new Error('Förbrukningsperioder får inte överlappa. Ångra den felaktiga posten först.');
  if (!a.plans || typeof a.plans !== 'object' || Array.isArray(a.plans)) throw new Error('Ogiltig månadsplan.');
  for (const [month,pieces] of Object.entries(a.plans)) {
    if (!validMonth(month) || !Number.isSafeInteger(pieces) || !amount(pieces)) throw new Error('Månadsplanen måste innehålla giltiga månader och hela antal stycken, minst 0.');
  }
  if(a.stockDate>today() || a.movements.some(m=>m.date>today()))throw new Error('Inventering och historik får inte ligga i framtiden.');
  for(const n of [a.stock,a.pack,...a.deliveries.map(d=>d.qty),...a.movements.map(m=>m.qty)])if(!Number.isSafeInteger(n))throw new Error('Ange hela stycken.');
  return a;
}
export function dailyUsage(a) { return a.usage / (a.period === 'week' ? 7 : 365.25/12); }
export function validMonth(month) { return typeof month==='string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month>='1900-01' && month<='9998-12'; }
export function monthAfter(month,offset=1) {
  const [year,m]=month.split('-').map(Number);
  return new Date(Date.UTC(year,m-1+offset,1)).toISOString().slice(0,7);
}
function overlap(from,to,start,end) { return Math.max(0,Math.min(to,end)-Math.max(from,start)); }
// Actual periods include both dates. Internal ranges are [start, end).
function consumptionCalendar(a,asOf) {
  const actual=a.movements.filter(m=>m.type==='usage'&&!m.voided&&m.date<=asOf).map(m=>({start:dayNumber(m.from),end:dayNumber(m.date)+1,qty:m.qty}));
  const profiles=new Map();
  function profile(month) {
    if(profiles.has(month)) return profiles.get(month);
    const start=dayNumber(`${month}-01`),end=dayNumber(`${monthAfter(month)}-01`);
    let actualQty=0,recordedDays=0;
    for(const m of actual) {const days=overlap(m.start,m.end,start,end);recordedDays+=days;actualQty+=m.qty*days/(m.end-m.start);}
    const pieces=Object.hasOwn(a.plans,month)?a.plans[month]:null;
    const plannedQty=pieces===null?null:pieces;
    const exceeded=plannedQty!==null&&actualQty>plannedQty+1e-8;
    const remainingQty=plannedQty===null?null:Math.max(0,plannedQty-actualQty);
    const unrecordedDays=end-start-recordedDays;
    const rate=pieces===null||exceeded?dailyUsage(a):unrecordedDays>0?remainingQty/unrecordedDays:0;
    const pendingStart=Math.max(start,dayNumber(asOf));
    const pendingDays=Math.max(0,end-pendingStart)-actual.reduce((sum,m)=>sum+overlap(m.start,m.end,pendingStart,end),0);
    const value={month,pieces,plannedQty,actualQty,recordedDays,remainingQty,rate,exceeded,totalQty:actualQty+rate*unrecordedDays,production:a.productionSources?.[month]||null,source:pieces===null?'average':exceeded?'exceeded':'plan',forecastQty:Math.max(0,pendingDays)*rate};
    profiles.set(month,value);return value;
  }
  function missingDays(start,end) { return end-start-actual.reduce((sum,m)=>sum+overlap(m.start,m.end,start,end),0); }
  function demand(start,end) {
    let result=0,cursor=start;
    while(cursor<end) {
      const month=new Date(cursor*DAY).toISOString().slice(0,7);
      const stop=Math.min(end,dayNumber(`${monthAfter(month)}-01`));
      result+=Math.max(0,missingDays(cursor,stop))*profile(month).rate;
      cursor=stop;
    }
    return result;
  }
  function rateAt(day) {
    if(actual.some(m=>m.start<=day&&day<m.end)) return 0;
    return profile(new Date(day*DAY).toISOString().slice(0,7)).rate;
  }
  return {profile,demand,rateAt,missingDays};
}
export function monthlyPlan(a,month,asOf=today()) { return consumptionCalendar(a,asOf).profile(month); }
export function inventory(a, asOf=today(), calendar=consumptionCalendar(a,asOf)) {
  if (!a.stockDate || a.stockDate > asOf) return { confirmed:false, ledger:a.stock, estimated:null, estimatedDays:0, countDate:null, countQty:null, deficit:0 };
  const active=a.movements.filter(m=>!m.voided && m.date<=asOf);
  // Inventeringar gäller dagens början; dagens uttag och leveranser kommer därefter.
  const counts=active.filter(m=>m.type==='count').sort((x,y)=>x.date.localeCompare(y.date));
  const last=counts.at(-1);
  const countDate=last?.date || a.stockDate;
  const countQty=last?.qty ?? a.stock;
  const start=dayNumber(countDate), end=dayNumber(asOf);
  let ledger=countQty;
  for(const m of active) {
    if((m.type==='receipt'||m.type==='adjustment') && m.date>=countDate) ledger+=m.qty;
    if(m.type==='usage') {
      const from=dayNumber(m.from), to=dayNumber(m.date)+1;
      ledger-=m.qty*overlap(from,to,start,end+1)/(to-from);
    }
  }
  const estimatedDays=Math.max(0,calendar.missingDays(start,end));
  const raw=ledger-calendar.demand(start,end);
  return {confirmed:true,ledger,estimated:Math.max(0,raw),estimatedDays,countDate,countQty,deficit:Math.max(0,-raw)};
}
export function usageHistory(a, asOf=today(), days=30) {
  const end=dayNumber(asOf), start=end-days+1;
  let qty=0, recordedDays=0;
  for(const m of a.movements.filter(m=>m.type==='usage'&&!m.voided)) {
    const from=dayNumber(m.from), to=dayNumber(m.date);
    const overlap=Math.max(0,Math.min(end,to)-Math.max(start,from)+1);
    recordedDays+=overlap; qty+=m.qty*overlap/(to-from+1);
  }
  return {qty,days:recordedDays,weekly:recordedDays ? qty/recordedDays*7 : null};
}
export function addMovement(a, movement, asOf=today()) {
  if(!a.stockDate) throw new Error('Bekräfta startsaldot först.');
  if(movement.date>asOf || (movement.from && movement.from>asOf)) throw new Error('Lagerrörelser kan inte dateras i framtiden. Registrera framtida leveranser som planerade.');
  const next=structuredClone(a);
  if(movement.delivery) {
    const d=next.deliveries.find(d=>d.id===movement.delivery.id);
    if(!d || d.qty!==movement.qty || d.date!==movement.delivery.date) throw new Error('Leveransen har ändrats eller redan tagits emot.');
    next.deliveries=a.deliveries.filter(d=>d.id!==movement.delivery.id).map(d=>({...d}));
  }
  next.movements.push({...movement,voided:false});
  return validateArticle(next);
}
export function voidMovement(a,id) {
  const next=structuredClone(a), m=next.movements.find(m=>m.id===id);
  if(!m || m.voided) throw new Error('Posten är redan ångrad eller saknas.');
  m.voided=true;
  if(m.delivery) {
    if(next.deliveries.some(d=>d.id===m.delivery.id)) throw new Error('Leveransen finns redan i leveransplanen.');
    next.deliveries.push({...m.delivery});
  }
  return validateArticle(next);
}
export function forecast(a, asOf = today()) {
  const calendar=consumptionCalendar(a,asOf),currentMonth=calendar.profile(asOf.slice(0,7));
  const stock=inventory(a,asOf,calendar),daily=currentMonth.rate;
  const overdue=a.deliveries.filter(d=>d.date<asOf);
  if(!stock.confirmed) return {...stock,daily,currentMonth,overdue,status:'unconfirmed',shortage:null,orderIn:Infinity,orderQty:null,cartons:null,piecesPerPack:a.pack};
  const start=dayNumber(asOf);
  const future=a.deliveries.filter(d=>d.date>=asOf);
  // Demand changes at month boundaries, delivery dates and the end of today's actual usage.
  const events=new Set([start,start+1]);
  for(const month of Object.keys(a.plans)) {
    const from=dayNumber(`${month}-01`),to=dayNumber(`${monthAfter(month)}-01`);
    if(from>=start)events.add(from);
    if(to>start)events.add(to);
  }
  const deliveries=new Map();
  for(const d of future) {const at=dayNumber(d.date);events.add(at);deliveries.set(at,(deliveries.get(at)||0)+d.qty);}
  let balance=stock.estimated,cursor=start,shortage=null,hasDemand=false;
  for(const at of [...events].sort((x,y)=>x-y)) {
    const rate=calendar.rateAt(cursor),required=(at-cursor)*rate;
    if(required>0)hasDemand=true;
    if(rate>0 && balance+1e-8<required) {shortage=cursor-start+Math.max(0,balance)/rate;break;}
    balance=Math.max(0,balance-required)+(deliveries.get(at)||0);cursor=at;
  }
  if(shortage===null) {
    const rate=calendar.rateAt(cursor);
    if(rate>0) {hasDemand=true;shortage=cursor-start+balance/rate;}
  }
  const daysLeft=daily>0?stock.estimated/daily:Infinity;
  const orderIn=shortage===null?Infinity:Math.floor(shortage-a.lead-a.buffer);
  const horizon=a.lead+a.buffer+a.coverage;
  const inbound=future.filter(d=>dayNumber(d.date)-start<=horizon).reduce((s,d)=>s+d.qty,0);
  const requiredQty=calendar.demand(start,start+horizon);
  const needed=Math.max(0,requiredQty-stock.estimated-inbound);
  const cartons=Math.max(0,Math.ceil(needed/a.pack-1e-10));
  const urgent=shortage!==null&&shortage<a.lead;
  return {...stock,daily,currentMonth,daysLeft,shortage,orderIn,overdue,cartons,requiredQty,orderQty:cartons*a.pack,piecesPerPack:a.pack,status:!hasDemand?'idle':urgent?'critical':orderIn<=0?'order':'ok'};
}
export function validateProduct(p,articles) {
  if(!p || typeof p.id!=='string' || !p.id || typeof p.name!=='string' || !p.name.trim() || p.name.length>120 || typeof p.notes!=='string') throw new Error('Produkten måste ha ett namn eller artikelnummer.');
  if(!Array.isArray(p.recipe) || !p.recipe.length || p.recipe.length>1000) throw new Error('Lägg till minst en receptposition.');
  const ids=new Set(articles.map(a=>a.id));let total=0;
  for(const [index,row] of p.recipe.entries()) {
    const label=`position ${index+1}`;
    if(!row || !Number.isSafeInteger(row.pieces) || row.pieces<0 || row.pieces>1000000) throw new Error(`Ange hela klossar per produkt för ${label} (0–1 000 000).`);
    if(row.articleId===null) {throw new Error(`Välj kloss för ${label}.`);}
    else if(typeof row.articleId!=='string' || !ids.has(row.articleId) || row.pieces===0) throw new Error(`Välj en befintlig kloss och ett antal större än 0 för ${label}.`);
    total+=row.pieces;
  }
  if(total===0)throw new Error('Välj minst en kloss med förbrukning per produkt.');
  if(!p.plans || typeof p.plans!=='object' || Array.isArray(p.plans))throw new Error('Ogiltig produktionsplan.');
  for(const [month,quantity] of Object.entries(p.plans))if(!validMonth(month)||!Number.isSafeInteger(quantity)||quantity<0||quantity>1000000000)throw new Error('Produktionsplanen ska innehålla hela produkter, 0–1 000 000 000 per månad.');
  return p;
}
export function validateData(articles,products) {
  if(!Array.isArray(articles)||articles.length>10000)throw new Error('Ogiltig klosslista (högst 10 000 artiklar).');
  articles.forEach(validateArticle);
  if(articles.some(a=>!a.number.trim()) || new Set(articles.map(a=>a.number.trim().toLowerCase())).size!==articles.length)throw new Error('Artikelnummer måste vara ifyllda och unika.');
  if(!uniqueIds(articles))throw new Error('Dubbla kloss-ID:n.');
  if(!Array.isArray(products)||products.length>10000||!uniqueIds(products))throw new Error('Ogiltig produktlista eller dubbla produkt-ID:n.');
  const names=new Set();
  for(const p of products){validateProduct(p,articles);const name=p.name.trim().toLocaleLowerCase('sv-SE');if(names.has(name))throw new Error('Produktnamn eller artikelnummer måste vara unika.');names.add(name);}
  deriveArticles(articles,products); // Also reject unsafe aggregate quantities before saving.
}
export function productBlocks(p) {
  const result=new Map();
  for(const row of p.recipe){if(row.articleId)result.set(row.articleId,(result.get(row.articleId)||0)+row.pieces);}
  return result;
}
function appendProduction(a,p,perProduct) {
  for(const [month,quantity] of Object.entries(p.plans)) {
    const pieces=quantity*perProduct;
    if(!a.productionSources[month]){a.productionSources[month]=[];a.plans[month]=0;}
    const sum=a.plans[month]+pieces;
    if(!Number.isSafeInteger(sum)||sum>1e12)throw new Error(`För stor klossmängd i produktionsplanen för ${a.name}, ${month}.`);
    a.plans[month]=sum;
    a.productionSources[month].push({productId:p.id,productName:p.name,quantity,perProduct,pieces});
  }
}
export function deriveArticle(a,products=[]) {
  const result={...a,plans:{...a.plans},productionSources:{}};
  for(const p of products){const perProduct=productBlocks(p).get(a.id);if(perProduct)appendProduction(result,p,perProduct);}
  return result;
}
export function deriveArticles(articles,products=[]) {
  const result=articles.map(a=>({...a,plans:{...a.plans},productionSources:{}}));
  const byId=new Map(result.map(a=>[a.id,a]));
  for(const p of products)for(const [id,perProduct] of productBlocks(p)) {
    const a=byId.get(id);if(!a)throw new Error(`Produkten ${p.name} hänvisar till en kloss som saknas.`);
    appendProduction(a,p,perProduct);
  }
  return result;
}
export function parseData(raw) {
  const data=JSON.parse(raw);
  if(data.app!=='kloss' || data.version!==SCHEMA_VERSION)throw new Error('Välj en Kloss-säkerhetskopia i version 1.');
  const {articles,products}=data;
  validateData(articles,products);
  return {articles,products};
}
export function parseBackup(raw) { return parseData(raw).articles; }
