/* Vehicle Command Center uses existing tickets as evidence; no inferred health scores. */
(function(){
  'use strict';
  window.PdcVehicleCenter={create:function(api){
    var R=window.PdcVehicleRecords, $=function(id){return document.getElementById(id);};
    var selected=api.selected() || '', notesOwner='';
    var systems=['Unassigned','Engine','Fuel','Cooling','Transmission','Driveline','Electrical','Starting/Charging','HVAC','Steering','Suspension','Brakes','Tires/Wheels','Exhaust/Emissions','Body','Safety','Maintenance'];
    function el(tag,text,cls){var node=document.createElement(tag);if(text!=null) node.textContent=String(text);if(cls)node.className=cls;return node;}
    function date(value){var d=new Date(value);return value && !isNaN(d)?d.toLocaleDateString():'Date not recorded';}
    function vehicle(){return R.find(api.db(),selected);}
    function message(text,bad){$('vehicleMessage').textContent=text;$('vehicleMessage').classList.toggle('warn',!!bad);}
    function save(text){var ok=api.save();message(ok===false?'Changes are in memory but could not be saved. Export a JSON backup before closing.':text,ok===false);return ok;}
    function button(text,action,cls){var b=el('button',text,cls || 'vehicle-secondary');b.type='button';b.addEventListener('click',action);return b;}
    function textBlock(box,label,text){if(!String(text || '').trim())return;var item=el('div',null,'vehicle-fact');item.appendChild(el('strong',label));item.appendChild(el('p',text));box.appendChild(item);}
    function show(id){
      selected=id;api.select(id);api.navigate();render();
      $('vehicleRecordTitle').focus();
    }
    function renderPicker(){
      var db=api.db(),query=$('vehicleSearch').value.trim().toLowerCase().split(/\s+/).filter(Boolean),list=$('vehicleList');list.replaceChildren();
      var vehicles=db.vehicles.filter(function(v){
        var history=R.jobs(db,v.id),customers=v.customerIds.map(function(id){var c=api.customer(id);return c?[c.name,c.phone,c.email].join(' '):'';});
        var hay=[R.label(v),v.vin,v.plate,v.technicalNotes,customers.join(' '),history.map(function(j){return [j.title,j.roNo,j.invNo,j.notes,j.overallNotes,j.internalNotes,Object.values(j.diagnosticRecord || {}).join(' '),(j.lines || []).map(function(l){return l.desc;}).join(' ')].join(' ');}).join(' '),v.recommendations.map(function(r){return r.text;}).join(' ')].join(' ').toLowerCase();
        return query.every(function(token){return hay.indexOf(token)!==-1;});
      });
      $('vehicleCount').textContent=vehicles.length+' of '+db.vehicles.length+' vehicle records';
      if(!vehicles.length)list.appendChild(el('p',query.length?'No matching vehicle records.':'Register a vehicle, or enter vehicle identity on an existing ticket.','service-empty'));
      vehicles.forEach(function(v){
        var b=button('',function(){selected=v.id;api.select(v.id);render();$('vehicleRecordTitle').focus();},'vehicle-list-row');b.dataset.vehicleId=v.id;b.setAttribute('aria-pressed',String(selected===v.id));
        b.appendChild(el('strong',R.label(v)));b.appendChild(el('span',v.vin?'VIN '+v.vin+(R.validVin(v.vin)?'':' • review VIN format'):'VIN not recorded • identity review needed'));
        var customers=v.customerIds.map(function(id){var c=api.customer(id);return c && c.name;}).filter(Boolean);
        b.appendChild(el('span',customers.join(' · ') || 'Customer not linked'));list.appendChild(b);
      });
    }
    function renderRecommendations(v){
      var box=$('vehicleRecommendations');box.replaceChildren();
      var open=v.recommendations.filter(function(r){return r.status!=='Resolved' && r.status!=='Declined';});
      $('vehicleOpenCount').textContent=open.length+' open / deferred';
      if(!v.recommendations.length)box.appendChild(el('p','No structured recommendations recorded. Ticket advisories appear in the timeline.','service-empty'));
      v.recommendations.forEach(function(r){
        var row=el('article',null,'vehicle-recommendation');row.appendChild(el('strong',r.text));
        var source=R.jobs(api.db(),v.id).find(function(j){return j.id===r.sourceJobId;});
        row.appendChild(el('p',[r.system || 'Unassigned',date(r.createdAt),source?'Source: '+source.title:'Vehicle record'].join(' · ')));
        var status=el('select');status.setAttribute('aria-label','Recommendation status: '+r.text);
        ['Open','Deferred','Resolved','Declined'].forEach(function(s){status.appendChild(new Option(s,s));});status.value=r.status || 'Open';
        status.addEventListener('change',function(){r.status=status.value;r.updatedAt=new Date().toISOString();r.resolvedAt=r.status==='Resolved'?r.updatedAt:null;save('Recommendation status saved.');renderRecommendations(v);});row.appendChild(status);
        if(source)row.appendChild(button('Open source ticket',function(){api.openJob(source.id);}));box.appendChild(row);
      });
    }
    function renderTimeline(v,history){
      var container=$('vehicleTimeline');container.replaceChildren();
      if(!history.length){container.appendChild(el('p','No linked service tickets yet. Create a job for this vehicle or link the open ticket.','service-empty'));return;}
      history.forEach(function(j,index){
        var details=el('details',null,'vehicle-timeline-item');details.open=index===0;
        var summary=el('summary');summary.appendChild(el('strong',j.title || 'Untitled ticket'));summary.appendChild(el('span',[date(j.createdAt),j.odometer!==''&&j.odometer!=null?Number(j.odometer).toLocaleString()+' mi':'Mileage not recorded',j.status,j.invNo,api.money(api.financials(j).grand)].filter(Boolean).join(' · ')));details.appendChild(summary);
        var body=el('div',null,'vehicle-timeline-body'),d=j.diagnosticRecord || {};
        textBlock(body,'Customer concern',d.concern || j.notes);textBlock(body,'Trouble codes / scan notes',d.codes);textBlock(body,'Tests / measurements',d.tests);textBlock(body,'Confirmed findings',d.findings);textBlock(body,'Correction',d.correction);textBlock(body,'Verification',d.verification);
        textBlock(body,'Technician notes',j.overallNotes);textBlock(body,'Private ticket notes',j.internalNotes);
        if(j.recommendedFutureRepairs){textBlock(body,'Ticket advisory — status not recorded',j.recommendedFutureRepairs);body.appendChild(button('Track this advisory as an open recommendation',function(){
          if(v.recommendations.some(function(r){return r.sourceJobId===j.id && r.text===j.recommendedFutureRepairs;})){message('This ticket advisory is already tracked.');return;}
          v.recommendations.push({id:crypto.randomUUID(),text:j.recommendedFutureRepairs,system:'Unassigned',status:'Open',sourceJobId:j.id,createdAt:new Date().toISOString()});save('Ticket advisory added to recommendations.');renderRecommendations(v);
        }));}
        var lines=(j.lines || []).filter(function(l){return l.desc;});
        if(lines.length){var list=el('ul',null,'vehicle-recorded-work');lines.forEach(function(l){list.appendChild(el('li',l.type+' · '+l.desc+' · '+l.qty+(l.type==='Labor'||l.type==='Diagnostic'?' hrs':' qty')));});body.appendChild(el('strong','Recorded work / estimate lines'));body.appendChild(list);}
        var docs=(j.sourceDocumentIds || []).map(function(id){return (api.db().documents || []).find(function(x){return x.id===id;});}).filter(Boolean);
        var photoCount=(j.photos || []).length;
        if(photoCount || docs.length)textBlock(body,'Evidence on ticket',photoCount+' photos'+(docs.length?' · '+docs.map(function(x){return x.fileName;}).join(', '):''));
        body.appendChild(button('Open job / estimate',function(){api.openJob(j.id);},'vehicle-primary'));details.appendChild(body);container.appendChild(details);
      });
    }
    function renderDetail(){
      var v=vehicle();$('vehicleEmpty').hidden=!!v;$('vehicleRecord').hidden=!v;if(!v)return;
      var history=R.ordered(R.jobs(api.db(),v.id)),mileages=R.mileage(api.db(),v.id),latest=history[0];
      $('vehicleRecordTitle').textContent=R.label(v);
      $('vehicleRecordIdentity').textContent=[v.vin?'VIN '+v.vin+(R.validVin(v.vin)?'':' — review VIN format; matching requires a full VIN'):'VIN not recorded — tickets were not combined by make/model',v.plate?'Plate '+v.plate:''].filter(Boolean).join(' · ');
      var customer=latest && api.customer(latest.customerId);
      if(!customer)customer=api.customer(v.customerIds[0]);
      $('vehicleCurrentCustomer').textContent=customer?customer.name:'Customer not linked';
      $('vehicleCurrentCustomerHint').textContent=latest?'Customer on latest service ticket':'Customer linked at registration';
      $('vehicleMileage').textContent=mileages.length?mileages[0].value.toLocaleString()+' mi':'Not recorded';
      $('vehicleMileageHint').textContent=mileages.length?'From '+date(mileages[0].date)+' ticket':'Enter odometer on a service ticket';
      var active=history.filter(function(j){return j.status!=='Done';});
      $('vehicleStatus').textContent=active.length?active.length+' open ticket'+(active.length===1?'':'s'):'No open tickets';
      $('vehicleStatusHint').textContent=active.length?active[0].status:'Based on recorded work status';
      var customerNames=v.customerIds.map(function(id){var c=api.customer(id);return c?c.name:'Customer no longer present';});
      $('vehicleCustomerHistory').textContent=customerNames.join(' · ') || 'No customer history recorded.';
      var activeBox=$('vehicleActiveJobs');activeBox.replaceChildren();
      active.forEach(function(j){var b=button(j.title+' · '+j.status,function(){api.openJob(j.id);},'service-history-row');activeBox.appendChild(b);});
      if(!active.length)activeBox.appendChild(el('p','No open work recorded for this vehicle.','service-empty'));
      var mileageBox=$('vehicleMileageHistory');mileageBox.replaceChildren();
      mileages.forEach(function(m){mileageBox.appendChild(el('p',m.value.toLocaleString()+' mi · '+date(m.date)+' · '+m.title));});
      if(!mileages.length)mileageBox.appendChild(el('p','No mileage observations yet.'));
      if(notesOwner!==v.id || document.activeElement!==$('vehicleTechnicalNotes'))$('vehicleTechnicalNotes').value=v.technicalNotes;
      notesOwner=v.id;
      var current=api.currentJob();$('vehicleLinkCurrent').disabled=!current || current.vehicleId===v.id;
      $('vehicleLinkCurrent').textContent=current?'Link open ticket: '+current.title:'Open a ticket to link it';
      renderRecommendations(v);renderTimeline(v,history);api.grow($('vehicles'));
    }
    function refreshFormOptions(){
      var customer=$('vehicleNewCustomer'),previous=customer.value;customer.replaceChildren(new Option('Select customer…',''));
      api.db().customers.filter(function(c){return !c.archivedAt;}).forEach(function(c){customer.appendChild(new Option(c.name,c.id));});customer.value=previous;
      var picker=$('jobVehicleRecord'),old=picker.value;picker.replaceChildren(new Option('Enter vehicle below, or choose a record…',''));
      api.db().vehicles.forEach(function(v){picker.appendChild(new Option(R.label(v)+(v.vin?' · '+v.vin:' · VIN not recorded'),v.id));});picker.value=old;
    }
    function render(){R.upgrade(api.db());api.save();refreshFormOptions();renderPicker();renderDetail();}
    $('vehicleSearch').addEventListener('input',renderPicker);
    $('vehicleNewForm').addEventListener('submit',function(e){
      e.preventDefault();api.persist();var cid=$('vehicleNewCustomer').value,record={customerIds:[cid]};
      ['vin','year','make','model','engine','plate','label'].forEach(function(key){record[key]=$('vehicleNew'+key[0].toUpperCase()+key.slice(1)).value.trim();});
      if(!cid || !(record.vin || record.make || record.model || record.label)){message('Choose a customer and enter a VIN, make/model, or vehicle description.',true);return;}
      var result=R.register(api.db(),record);selected=result.vehicle.id;api.select(selected);save(result.created?'Vehicle registered.':'This VIN is already registered. Opened the existing record.');this.reset();$('vehicleRegister').open=false;render();
    });
    $('vehicleTechnicalNotes').addEventListener('input',function(){var v=vehicle();if(!v || notesOwner!==v.id)return;v.technicalNotes=this.value;v.updatedAt=new Date().toISOString();save('Vehicle technical notes saved.');api.grow($('vehicles'));});
    systems.forEach(function(system){$('vehicleRecSystem').appendChild(new Option(system,system));});
    $('vehicleRecForm').addEventListener('submit',function(e){
      e.preventDefault();var v=vehicle(),text=$('vehicleRecText').value.trim();if(!v || !text)return;
      var j=api.currentJob();v.recommendations.push({id:crypto.randomUUID(),text:text,system:$('vehicleRecSystem').value,status:'Open',sourceJobId:j && j.vehicleId===v.id?j.id:'',createdAt:new Date().toISOString()});save('Recommendation saved.');$('vehicleRecText').value='';renderRecommendations(v);
    });
    $('vehicleNewJob').addEventListener('click',function(){var v=vehicle();if(v)api.prepareJob(v);});
    $('vehicleLinkCurrent').addEventListener('click',function(){
      api.persist();var result=R.link(api.db(),api.currentJob(),selected);
      if(!result.ok){message(result.message,true);return;}
      save('Open ticket linked. Its prices, notes and customer history are preserved.');api.reloadCurrent();render();
    });
    $('jobVehicleRecord').addEventListener('change',function(){var v=R.find(api.db(),this.value);if(v)api.fillJobVehicle(v);});
    document.querySelector('[data-tab="vehicles"]').addEventListener('click',render);
    $('serviceVehicleRecord').addEventListener('click',function(){api.persist();R.upgrade(api.db());var j=api.currentJob();if(j && j.vehicleId)show(j.vehicleId);else {api.navigate();render();message('Enter vehicle identity on the ticket, or register a vehicle and link the open ticket.');}});
    render();
    return {render:render,show:show,refreshContext:function(){var j=api.currentJob();$('serviceVehicleRecord').disabled=!j;}};
  }};
})();
