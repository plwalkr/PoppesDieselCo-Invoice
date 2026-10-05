const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM, VirtualConsole} = require('jsdom');
const html = fs.readFileSync(process.env.APP_HTML || 'index.html', 'utf8').replace(
  '<script src="service-desk.js" defer></script>',
  '<script>'+fs.readFileSync('service-desk.js','utf8')+'</script>'
);
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
  assert.equal(printed.querySelector('#documentLogo').getAttribute('src'),'https://local-test.invalid/assets/poppes-diesel-logo.png');
});

test('dashboard opens the exact job even with duplicate customer/job labels',async t=>{
  const db=seed(); db.jobs.forEach(j=>j.title='Same title');
  const {$,read}=await app(t,{db});
  $('#overallNotes').value='Pending work on A';
  $('[data-tab="dashboard"]').click();
  $('#dashRecentActivity [data-job-id="b"]').click();
  assert.equal($('#invoice').classList.contains('active'),true);
  assert.equal($('#invJob').value,'b');
  assert.equal($('#overallNotes').value,'Notes b');
  assert.equal(read().jobs[0].overallNotes,'Pending work on A');
  assert.equal(read().jobs[1].lines[0].qty,2);
  await Promise.resolve();
  assert.equal($('#workspaceTitle').textContent,'Estimates & invoices');
});

test('deposit and margin alerts open their linked ticket without changing money rules',async t=>{
  const db=seed(); db.jobs[1].lines=[{type:'Part',desc:'Part',qty:1,cost:200,unit:210}];
  const {$,read}=await app(t,{db});
  $('[data-tab="dashboard"]').click();
  $('#dashDepositTracker [data-job-id="b"]').click();
  assert.equal($('#invJob').value,'b');
  assert.equal(read().jobs[1].depositRequired,210);
  $('[data-tab="dashboard"]').click();
  $('#dashProfitLeaks [data-job-id="b"]').click();
  assert.equal($('#invJob').value,'b');
  assert.equal($('.lDesc').value,'Part');
});

test('workspace shortcuts use the existing ticket and schedule forms',async t=>{
  const {$,dom,read}=await app(t);
  $('#workspaceNewJob').click();
  assert.equal($('#jobs').classList.contains('active'),true);
  assert.equal(dom.window.document.activeElement,$('#jobCustomer'));
  assert.equal(read().jobs.length,2,'shortcut does not create a placeholder ticket');
  await Promise.resolve();
  assert.equal($('#workspaceTitle').textContent,'Jobs & service tickets');
  $('#workspaceSchedule').click();
  assert.equal($('#schedule').classList.contains('active'),true);
  await Promise.resolve();
  assert.equal($('#workspaceTitle').textContent,'Service schedule');
});

test('diagnostic worksheets remain attached to their ticket and private in customer PDFs',async t=>{
  const {$,change,read}=await app(t);
  change('#diagTests','Private measurement A');
  change('#diagFindings','Confirmed finding A');
  change('#serviceJob','b','change');
  assert.equal($('#diagTests').value,'');
  change('#diagTests','Private measurement B');
  change('#serviceJob','a','change');
  assert.equal($('#diagTests').value,'Private measurement A');
  assert.equal(read().jobs[1].diagnosticRecord.tests,'Private measurement B');
  $('#pdf').click();
  const printed=$('iframe').contentDocument;
  const encoded=printed.body.textContent.match(/PDC_RECOVERY_JSON_V1:([A-Za-z0-9+/=]+)/)[1];
  assert.equal(JSON.parse(Buffer.from(encoded,'base64').toString('utf8')).job.diagnosticRecord,undefined);
  assert.equal($('#preview').textContent.includes('Private measurement A'),false);
  assert.equal(read().jobs[0].diagnosticRecord.findings,'Confirmed finding A');
});

test('customer summary appends selected findings without replacing notes or copying private tests',async t=>{
  const {$,change,read}=await app(t);
  change('#diagTests','Shop-only test details');
  change('#diagCodes','Shop-only scan details');
  change('#diagFindings','Leak verified');
  change('#diagCorrection','Seal replaced');
  $('#diagAppendSummary').click();
  assert.match($('#overallNotes').value,/Notes a\n\nFindings: Leak verified\nWork performed: Seal replaced/);
  assert.equal($('#overallNotes').value.includes('Shop-only'),false);
  assert.match(read().jobs[0].overallNotes,/Seal replaced/);
  assert.match($('#preview').textContent,/Seal replaced/);
});

test('saved shop packages keep parts quantities and markup while using the incoming ticket labor rate',async t=>{
  const db=seed(); db.jobs[0].lines.push({type:'Part',desc:'Seal',qty:3,cost:20,markupPct:50,unit:30,note:'Verify fitment'});
  db.jobs[1].laborRate=120;
  const {$,change,read}=await app(t,{db});
  change('#servicePackageName','Seal repair');
  $('#serviceSavePackage').click();
  const saved=read().templates[0];
  assert.equal(saved.items[0].unit,null);
  assert.equal(saved.items[1].qty,3);
  assert.equal(saved.items[1].markupPct,50);
  change('#invJob','b','change');
  $('[data-service-view="serviceLibrary"]').click();
  $('#servicePackages button').click();
  const b=read().jobs[1];
  assert.equal(b.lines.length,3);
  assert.equal(b.lines[1].unit,120);
  assert.equal(b.lines[2].qty,3);
  assert.equal(b.lines[2].unit,30);
  assert.equal(b.lines[2].note,'Verify fitment');
  assert.equal($('#serviceLibrary').hidden,true);
  assert.equal($('#invoiceBuilder').hidden,false);
});

test('history matches VIN regardless of case and opens the exact ticket',async t=>{
  const db=seed(); db.jobs[0].vin='qa-vin'; db.jobs[1].vin='QA-VIN';
  db.jobs.push({...db.jobs[1],id:'c',vin:'Different-VIN'});
  const {$,read}=await app(t,{db});
  $('[data-service-view="serviceHistory"]').click();
  assert.equal($('#serviceHistoryList').children.length,1);
  $('#serviceHistoryList button').click();
  assert.equal($('#invJob').value,'b');
  assert.equal($('#diagTests').value,'');
  assert.equal(read().jobs[0].vin,'qa-vin');
});

test('work status changes independently of estimate approval and payment',async t=>{
  const {$,change,read}=await app(t);
  change('#serviceStatus','In Progress','change');
  const j=read().jobs[0];
  assert.equal(j.status,'In Progress');
  assert.equal(j.paid,false);
  assert.equal(j.docType,'Estimate');
  assert.equal(j.approvedAt || null,null);
  assert.equal($('#grand').textContent,'$105.35');
});

test('service library renders stored text literally without creating markup',async t=>{
  const db=seed(); db.templates=[{name:'<img id="libraryInjection">',platform:'Shop',items:[{type:'Labor',desc:'<script>bad</script>',qty:0.5}]}];
  const {$}=await app(t,{db});
  assert.equal($('#libraryInjection'),null);
  assert.equal($('#servicePackages h3').textContent,'<img id="libraryInjection">');
});

test('shop package unit prices use cents without floating-point text in money fields',async t=>{
  const db=seed(); db.templates=[{platform:'Test service',items:[{type:'Part',desc:'Filter',cost:38,markup:40}]}];
  const {$,read}=await app(t,{db});
  $('#servicePackages button').click();
  const unit=$('#lines tbody tr:last-child .lUnit');
  assert.equal(Number(unit.value),53.2);
  assert.match(unit.value,/^\d+(?:\.\d{1,2})?$/);
  assert.equal(read().jobs[0].lines[1].unit,53.2);
});

test('visible repair ticket picker follows search and customer filters while retaining the open form',async t=>{
  const db=seed();
  db.customers.push({id:'customer-c',name:'Other fleet'});
  db.jobs.push({...db.jobs[1],id:'c',customerId:'customer-c',title:'Cooling inspection'});
  const {$,change,read}=await app(t,{db});
  const ids=()=>Array.from($('#serviceJob').options).map(o=>o.value).filter(Boolean);
  change('#invJobSearch','Cooling');
  assert.deepEqual(ids().sort(),['a','c']);
  assert.equal($('#serviceJob').value,'a');
  change('#invCustFilter','customer-a','change');
  assert.deepEqual(ids(),['a']);
  change('#overallNotes','Open form survives filtering');
  assert.equal(read().jobs[0].overallNotes,'Open form survives filtering');
  change('#invJobSearch','');
  assert.deepEqual(ids().sort(),['a','b']);
  change('#serviceJob','b','change');
  assert.equal($('#overallNotes').value,'Notes b');
});
