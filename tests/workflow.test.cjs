const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM, VirtualConsole} = require('jsdom');
const html = ['service-desk.js','vehicle-records.js','vehicle-center.js'].reduce((source,file)=>
  source.replace('<script src="'+file+'" defer></script>','<script>'+fs.readFileSync(file,'utf8')+'</script>'),
  fs.readFileSync(process.env.APP_HTML || 'index.html', 'utf8'));
const key = 'poppe_shop_db_v112';
const qaVin = '1FT7W2BT1BEA12345';
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
  const db=seed(); db.jobs[0].vin=qaVin.toLowerCase(); db.jobs[1].vin=qaVin;
  db.jobs.push({...db.jobs[1],id:'c',vin:'Different-VIN'});
  const {$,read}=await app(t,{db});
  $('[data-service-view="serviceHistory"]').click();
  assert.equal($('#serviceHistoryList').children.length,1);
  $('#serviceHistoryList button').click();
  assert.equal($('#invJob').value,'b');
  assert.equal($('#diagTests').value,'');
  assert.equal(read().jobs[0].vin,qaVin.toLowerCase());
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

test('vehicle migration links normalized VINs across customers without rewriting financial snapshots',()=>{
  const R=require('../vehicle-records.js'),db=seed();
  db.customers.push({id:'new-owner',name:'New owner'});
  Object.assign(db.jobs[0],{vin:' '+qaVin.toLowerCase()+' ',vehicleYear:'2011',vehicleMake:'Ford',vehicleModel:'F-250',odometer:120000});
  Object.assign(db.jobs[1],{vin:qaVin,customerId:'new-owner',createdAt:'2026-09-01T12:00:00Z',odometer:140000});
  const snapshots=db.jobs.map(j=>JSON.stringify({lines:j.lines,invNo:j.invNo,customerId:j.customerId,vin:j.vin}));
  R.upgrade(db);
  assert.equal(db.vehicles.length,1);assert.equal(db.jobs[0].vehicleId,db.jobs[1].vehicleId);
  assert.deepEqual(new Set(db.vehicles[0].customerIds),new Set(['customer-a','new-owner']));
  assert.deepEqual(db.jobs.map(j=>JSON.stringify({lines:j.lines,invNo:j.invNo,customerId:j.customerId,vin:j.vin})),snapshots);
  assert.deepEqual(R.mileage(db,db.vehicles[0].id).map(x=>x.value),[140000,120000]);
  const once=JSON.stringify(db);R.upgrade(db);assert.equal(JSON.stringify(db),once);
});

test('same-model vehicles without VIN stay separate and identity-less jobs remain usable',()=>{
  const R=require('../vehicle-records.js'),db=seed();
  db.jobs.forEach(j=>Object.assign(j,{vehicleYear:'2016',vehicleMake:'Ram',vehicleModel:'2500'}));
  db.jobs.push({id:'unidentified',customerId:'customer-a',title:'Unidentified ticket',lines:[]});
  R.upgrade(db);assert.equal(db.vehicles.length,2);assert.notEqual(db.jobs[0].vehicleId,db.jobs[1].vehicleId);
  assert.equal(db.jobs[2].vehicleId,undefined);assert.equal(db.jobs[2].title,'Unidentified ticket');
});

test('a ticket VIN correction preserves the old vehicle memory and rejects conflicting links',()=>{
  const R=require('../vehicle-records.js'),db=seed();db.jobs.forEach(j=>j.vin=qaVin);R.upgrade(db);
  const old=db.vehicles[0];old.technicalNotes='Prior verified repair';old.recommendations.push({id:'r',text:'Inspect brakes',status:'Open'});
  db.jobs[0].vin='DIFFERENT-VIN';R.upgrade(db);
  assert.notEqual(db.jobs[0].vehicleId,old.id);assert.equal(db.jobs[1].vehicleId,old.id);assert.equal(old.technicalNotes,'Prior verified repair');
  const before=JSON.stringify(db);assert.equal(R.link(db,db.jobs[0],old.id).ok,false);assert.equal(JSON.stringify(db),before);
});

test('invalid vehicle collection is protected from automatic overwrite',async t=>{
  const db=seed();db.vehicles={bad:'shape'};const raw=JSON.stringify(db);
  const {dom,$}=await app(t,{raw});assert.equal(dom.window.localStorage.getItem(key),raw);assert.match($('#saveStatus').textContent,/protected from overwrite/);
  const R=require('../vehicle-records.js');assert.equal(R.validCollection([null]),false);assert.equal(R.validCollection([{recommendations:['malformed']}]),false);
});

test('vehicle command center shows sourced diagnostics and opens the exact job without changing invoices',async t=>{
  const db=seed();db.jobs.forEach(j=>Object.assign(j,{vin:qaVin,vehicleYear:'2011',vehicleMake:'Ford',vehicleModel:'F-250'}));
  db.jobs[0].odometer=120000;db.jobs[1].odometer=125000;db.jobs[1].createdAt='2026-09-01T12:00:00Z';
  db.jobs[1].diagnosticRecord={concern:'No cold air',tests:'Vacuum 20 inHg',findings:'Verified vacuum leak'};
  const snapshot=jobs=>jobs.map(j=>({id:j.id,lines:j.lines.map(l=>({...l,markupPct:Number(l.markupPct || 0)})),amountPaid:j.amountPaid}));
  const {$,read}=await app(t,{db});const before=snapshot(read().jobs);
  $('#serviceVehicleRecord').click();assert.equal($('#vehicles').classList.contains('active'),true);
  assert.equal($('#vehicleMileage').textContent,'125,000 mi');assert.match($('#vehicleTimeline').textContent,/Vacuum 20 inHg/);
  $('#vehicleTimeline .vehicle-timeline-item:first-child .vehicle-primary').click();assert.equal($('#invJob').value,'b');assert.equal($('#overallNotes').value,'Notes b');
  assert.deepEqual(snapshot(read().jobs),before);
});

test('vehicle notes and recommendation statuses persist across JSON reload and stay out of invoice preview',async t=>{
  const db=seed();db.jobs[0].vin='VEHICLE-A';const {$,change,read,dom}=await app(t,{db});
  $('#serviceVehicleRecord').click();change('#vehicleTechnicalNotes','PRIVATE VEHICLE MEMORY');
  change('#vehicleRecText','Inspect HVAC supply');change('#vehicleRecSystem','HVAC','change');
  $('#vehicleRecForm').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  const status=$('#vehicleRecommendations select');status.value='Resolved';status.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  const stored=read();assert.equal(stored.vehicles[0].recommendations[0].status,'Resolved');assert.equal($('#vehicleOpenCount').textContent,'0 open / deferred');
  assert.doesNotMatch($('#preview').textContent,/PRIVATE VEHICLE MEMORY|Inspect HVAC supply/);
  $('#pdf').click();
  const encoded=$('iframe').contentDocument.body.textContent.match(/PDC_RECOVERY_JSON_V1:([A-Za-z0-9+/=]+)/)[1];
  assert.doesNotMatch(Buffer.from(encoded,'base64').toString('utf8'),/PRIVATE VEHICLE MEMORY|Inspect HVAC supply/);
  const again=await app(t,{db:stored});again.$('#serviceVehicleRecord').click();assert.equal(again.$('#vehicleTechnicalNotes').value,'PRIVATE VEHICLE MEMORY');
  assert.equal(again.$('#vehicleRecommendations select').value,'Resolved');assert.equal(again.read().vehicles[0].id,stored.vehicles[0].id);
});

test('new job from a vehicle record retains its link and prefilled identity',async t=>{
  const db=seed();Object.assign(db.jobs[0],{vin:'VEHICLE-A',vehicleYear:'2011',vehicleMake:'Ford',vehicleModel:'F-250',vehicleEngine:'6.7 Power Stroke'});
  const {$,change,read,dom}=await app(t,{db});$('#serviceVehicleRecord').click();const id=read().jobs[0].vehicleId;$('#vehicleNewJob').click();
  assert.equal($('#jobCustomer').value,'customer-a');assert.equal($('#jobVIN').value,'VEHICLE-A');assert.equal($('#jobVehicleRecord').value,id);
  change('#jobTitle','Return visit');$('#jobForm').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  const j=read().jobs.find(j=>j.title==='Return visit');assert.equal(j.vehicleId,id);assert.equal(j.vehicleYear,'2011');assert.equal(j.vehicleEngine,'6.7 Power Stroke');assert.equal($('#invJob').value,j.id);
});

test('unidentified VIN-free tickets can be explicitly linked without mixing other vehicle histories',async t=>{
  const db=seed();db.jobs.forEach(j=>Object.assign(j,{vehicleYear:'2016',vehicleMake:'Ram',vehicleModel:'2500'}));
  const {$,read}=await app(t,{db});$('#serviceHistoryTab').click();assert.equal($('#serviceHistoryList').children.length,1);assert.match($('#serviceHistoryList').textContent,/No earlier/);
  const idB=read().jobs[1].vehicleId; $('[data-tab="vehicles"]').click(); $('[data-vehicle-id="'+idB+'"]').click();$('#vehicleLinkCurrent').click();
  assert.equal(read().jobs[0].vehicleId,idB);assert.equal(read().jobs[0].customerId,'customer-a');
  $('[data-tab="invoice"]').click();$('#serviceHistoryTab').click();assert.match($('#serviceHistoryList').textContent,/Job b/);
});

test('vehicle registration deduplicates VINs and renders stored markup as literal text',async t=>{
  const {$,change,read,dom}=await app(t);$('[data-tab="vehicles"]').click();
  function register(vin){change('#vehicleNewCustomer','customer-a','change');change('#vehicleNewVin',vin);change('#vehicleNewLabel','<img id="vehicleInjection">');$('#vehicleNewForm').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));}
  register('qa-registration');register('QA-REGISTRATION');assert.equal(read().vehicles.length,1);assert.equal($('#vehicleInjection'),null);
  assert.equal($('#vehicleRecordTitle').textContent,'<img id="vehicleInjection">');assert.match($('#vehicleMessage').textContent,/already registered/);
});

test('incomplete VINs never auto-combine records and customer-only vehicle descriptions remain available',()=>{
  const R=require('../vehicle-records.js'),db=seed();db.jobs.forEach(j=>j.vin='UNKNOWN');
  db.customers.push({id:'customer-only',name:'Legacy owner',vehicle:'1998 Dodge service truck'});
  R.upgrade(db);assert.notEqual(db.jobs[0].vehicleId,db.jobs[1].vehicleId);
  assert.equal(db.vehicles.find(v=>v.identitySourceCustomerId==='customer-only').label,'1998 Dodge service truck');
  const once=JSON.stringify(db);R.upgrade(db);assert.equal(JSON.stringify(db),once);
});

test('customer archiving is reversible and retains vehicles, tickets and invoice ownership',async t=>{
  const db=seed();db.jobs[0].vin=qaVin;const {$,read}=await app(t,{db});
  const vehicleId=read().jobs[0].vehicleId;$('[data-archivec="customer-a"]').click();
  assert.ok(read().customers[0].archivedAt);assert.equal(read().jobs.length,2);assert.equal(read().jobs[0].vehicleId,vehicleId);
  assert.equal($('#invJob').value,'a');assert.equal($('#overallNotes').value,'Notes a');
  assert.equal(Array.from($('#jobCustomer').options).some(o=>o.value==='customer-a'),false);
  $('[data-archivec="customer-a"]').click();assert.equal(read().customers[0].archivedAt,null);
  assert.equal(Array.from($('#jobCustomer').options).some(o=>o.value==='customer-a'),true);
});
