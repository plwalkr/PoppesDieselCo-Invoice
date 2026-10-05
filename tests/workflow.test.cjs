const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM, VirtualConsole} = require('jsdom');
const html = fs.readFileSync(process.env.APP_HTML || 'index.html', 'utf8');
const key = 'poppe_shop_db_v112';
function seed() {
  return {customers:[{id:'customer-a',name:'Test customer <fleet>',email:''}],
    jobs:['a','b'].map((id,i)=>({id,customerId:'customer-a',title:'Job '+id,status:'Open',
      docType:'Estimate',invNo:'EST-'+id,createdAt:'2026-06-14T12:00:00Z',
      overallNotes:'Notes '+id,internalNotes:'Internal '+id,amountPaid:0,
      lines:[{type:'Labor',desc:'Labor '+id,note:'Note '+id,qty:i+1,unit:100,list:0,cost:0}],
      signatures:{customer:null,manager:null}})),settings:{generalLaborRate:100,
      diagnosticRate:125,minimumDiagnosticCharge:150,shopSuppliesPercent:5,
      shopSuppliesCap:50,salesTaxPct:7,taxParts:true,taxLabor:false,taxShopSupplies:true},
    schedules:[],documents:[],templates:[]};
}
async function app(t,{db=seed(),raw,failWrites=false}={}) {
  const errors=[];
  const console = new VirtualConsole();
  console.on('jsdomError',e=>{if(e.type !== 'css parsing') errors.push(e.message);});
  const dom = new JSDOM(html,{url:'https://local-test.invalid/',runScripts:'dangerously',
    virtualConsole:console,beforeParse(w){
      w.scrollTo=()=>{}; w.alert=()=>{}; w.confirm=()=>true;
      w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}});
      w.localStorage.setItem(key,raw === undefined ? JSON.stringify(db) : raw);
      w.localStorage.setItem('pdc_ui_state',JSON.stringify({lastJobId:'a',activeTab:'invoice'}));
      if(failWrites) w.Storage.prototype.setItem=function(){throw new Error('Quota exceeded');};
    }});
  t.after(()=>dom.window.close());
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('App load timeout: '+dom.window.document.readyState)),5000);
    dom.window.addEventListener('load',()=>{clearTimeout(timer);resolve();},{once:true});
  });
  assert.equal(errors.length,0,errors.join('\n'));
  assert.match(dom.window.document.querySelector('#debugLog').textContent,/init ✅/);
  const $=s=>dom.window.document.querySelector(s);
  const change=(s,v,event='input')=>{const el=$(s);el.value=v;el.dispatchEvent(new dom.window.Event(event,{bubbles:true}));};
  const read=()=>JSON.parse(dom.window.localStorage.getItem(key));
  return {dom,$,change,read};
}
test('switching invoices saves the outgoing form and preserves incoming fields',async t=>{
  const {$,change,read}=await app(t);
  change('#overallNotes','Edited A');
  change('#invJob','b','change');
  assert.equal($('#overallNotes').value,'Notes b');
  assert.equal($('.lDesc').value,'Labor b');
  const jobs=read().jobs;
  assert.equal(jobs[0].overallNotes,'Edited A');
  assert.equal(jobs[1].overallNotes,'Notes b');
  assert.equal(jobs[1].lines[0].qty,2);
  change('#invJob','a','change');
  assert.equal($('#overallNotes').value,'Edited A');
});
test('search/filter and customer refresh preserve the form owner',async t=>{
  const {$,change,read,dom}=await app(t);
  change('#invJobSearch','nothing matches');
  assert.equal($('#invJob').value,'a');
  change('#invCustFilter','customer-a','change');
  assert.equal($('#invJob').value,'a');
  change('#custName','New customer');
  $('#custForm').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal($('#invJob').value,'a');
  change('#overallNotes','Still A');
  assert.equal(read().jobs[0].overallNotes,'Still A');
});
test('a second new job opens its own clean invoice',async t=>{
  const {$,change,read,dom}=await app(t);
  change('#jobCustomer','customer-a','change'); change('#jobTitle','New ticket');
  $('#jobForm').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal($('#overallNotes').value,'');
  assert.equal($('#lines tbody').children.length,0);
  assert.equal($('#invoice').classList.contains('active'),true);
  assert.equal(read().jobs.find(j=>j.title === 'New ticket').lines.length,0);
  assert.equal(read().jobs[0].lines[0].desc,'Labor a');
});
test('zero quantity and literal HTML survive loading without injected elements',async t=>{
  const db=seed(); db.jobs[0].lines=[{type:'Part',desc:'</textarea><img id="injected">',note:'<b>literal</b>',qty:0,cost:10,unit:14}];
  const {$,read}=await app(t,{db});
  assert.equal($('.lQty').value,'0');
  assert.equal(read().jobs[0].lines[0].qty,0);
  assert.equal($('#injected'),null);
  assert.equal($('.lNote').value,'<b>literal</b>');
  assert.equal($('#custTable tbody td').textContent,'Test customer <fleet>');
});
test('payment decimals stay editable and a balance clears paid status',async t=>{
  const {$,change,read}=await app(t);
  change('#amountPaid','12.50'); assert.equal($('#amountPaid').value,'12.50');
  $('#markPaid').click(); assert.equal(read().jobs[0].paid,true);
  change('#amountPaid','25'); assert.equal(read().jobs[0].paid,false);
  assert.ok(read().jobs[0].balanceDue > 0);
});
test('wheel does not trap scrolling or change focused money values',async t=>{
  const {$,dom}=await app(t); const el=$('#amountPaid'); el.focus();
  const ev=new dom.window.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:120});
  el.dispatchEvent(ev);
  assert.notEqual(dom.window.document.activeElement,el);
  assert.equal(ev.defaultPrevented,false); assert.equal(el.value,'0');
});
test('job list total includes the same supplies and tax as invoice',async t=>{
  const {$}=await app(t);
  assert.equal($('#jobsTable tbody tr td:nth-child(5)').textContent,$('#grand').textContent);
});
test('diagnostic minimum, supplies, and tax retain the existing business rules',async t=>{
  const db=seed(); db.jobs[0].lines=[{type:'Diagnostic',desc:'Diagnostic test',qty:0.5,unit:125,cost:0}];
  const {$}=await app(t,{db});
  assert.equal($('#laborSub').textContent,'$150.00');
  assert.equal($('#grand').textContent,'$158.03');
});
test('parts tax and upfront deposit remain intact',async t=>{
  const db=seed(); db.jobs[0].lines=[{type:'Part',desc:'Parts',qty:2,unit:140,cost:100,markupPct:40}];
  const {$,read}=await app(t,{db});
  assert.equal($('#grand').textContent,'$299.60');
  assert.equal(read().jobs[0].depositRequired,280);
});
test('warranty lines remain unbilled and internal notes remain out of the preview',async t=>{
  const db=seed(); db.jobs[0].lines.push({type:'Warranty',desc:'Warranty repair',qty:3,unit:100,cost:25});
  const {$}=await app(t,{db});
  assert.equal($('#grand').textContent,'$105.35');
  assert.equal($('#preview').textContent.includes('Internal a'),false);
});
test('invalid stored JSON is preserved instead of replaced with an empty database',async t=>{
  const {$,dom}=await app(t,{raw:'{broken'});
  assert.equal(dom.window.localStorage.getItem(key),'{broken');
  assert.match($('#saveStatus').textContent,/protected from overwrite/);
});
test('storage failure is visibly reported',async t=>{
  const {$}=await app(t,{failWrites:true});
  assert.equal($('#saveStatus').classList.contains('error'),true);
  assert.match($('#saveStatus').textContent,/not saved/);
});
test('legacy databases without settings still upgrade and save',async t=>{
  const db=seed(); delete db.settings;
  const {$,read}=await app(t,{db});
  assert.equal($('#saveStatus').classList.contains('error'),false);
  assert.equal(read().settings.generalLaborRate,100);
});
test('reimporting the open document preserves imported lines instead of old form values',async t=>{
  const {$,read,dom}=await app(t);
  const payload={kind:'pdc-pdf-recovery',schema:1,customer:seed().customers[0],job:seed().jobs[0]};
  payload.job.lines[0].desc='Imported replacement'; payload.job.lines[0].qty=4;
  payload.job.overallNotes='Imported notes';
  const text='PDC_RECOVERY_JSON_V1:'+Buffer.from(JSON.stringify(payload)).toString('base64');
  Object.defineProperty($('#pdfImportFile'),'files',{value:[{name:'qa.txt',type:'text/plain',text:async()=>text}]});
  $('#pdfImportBtn').click();
  for(let i=0;i<20 && !$('#pdfImportStatus').textContent.includes('Updated existing job');i++) await new Promise(r=>setTimeout(r,10));
  assert.match($('#pdfImportStatus').textContent,/Updated existing job/);
  assert.equal($('.lDesc').value,'Imported replacement');
  assert.equal(read().jobs[0].lines[0].qty,4);
  assert.equal($('#overallNotes').value,'Imported notes');
});
test('generated print document keeps recovery data but excludes private notes',async t=>{
  const {$,read}=await app(t);
  $('#pdf').click();
  const printed=$('iframe').contentDocument;
  const match=printed.body.textContent.match(/PDC_RECOVERY_JSON_V1:([A-Za-z0-9+/=]+)/);
  assert.ok(match,'recovery payload is present');
  const payload=JSON.parse(Buffer.from(match[1],'base64').toString('utf8'));
  assert.equal(payload.job.internalNotes,undefined);
  assert.equal(payload.job.lines[0].desc,'Labor a');
  assert.equal(read().jobs[0].internalNotes,'Internal a');
  assert.equal(printed.querySelector('#pGrand').textContent,'$105.35');
});
