/* Vehicle-first tools; record ownership and financial calculations stay in the existing app. */
(function(){
  'use strict';
  window.PdcServiceDesk = {
    create: function(api){
      var $ = function(id){ return document.getElementById(id); };
      var fieldMap = {concern:'diagConcern',codes:'diagCodes',tests:'diagTests',findings:'diagFindings',correction:'diagCorrection',verification:'diagVerification'};
      var ownerId = null;
      var ticketSignature = '';
      function message(text, warn){
        $('serviceDeskMessage').textContent = text;
        $('serviceDeskMessage').classList.toggle('warn', !!warn);
      }
      function setView(view, focus){
        document.querySelectorAll('[data-service-view]').forEach(function(b){
          var selected = b.dataset.serviceView === view;
          b.setAttribute('aria-selected', String(selected));
          b.tabIndex = selected ? 0 : -1;
        });
        ['invoiceBuilder','serviceLibrary','diagnosticWorksheet','serviceHistory'].forEach(function(id){ $(id).hidden = id !== view; });
        if(view === 'serviceLibrary') renderLibrary();
        if(view === 'serviceHistory') renderHistory();
        if(view === 'diagnosticWorksheet') api.grow($('diagnosticWorksheet'));
        if(focus) $(focus).focus();
      }
      function refreshContext(){
        var j = api.job(), c = j && api.customer(j.customerId);
        var vehicle = j ? [j.vehicleYear,j.vehicleMake,j.vehicleModel,j.vehicleEngine].filter(Boolean).join(' ') : '';
        $('serviceVehicle').textContent = vehicle || (c && c.vehicle) || 'Vehicle not entered';
        $('serviceCustomer').textContent = c ? c.name : 'Select a job to begin';
        $('serviceTicket').textContent = j ? (j.title || 'Untitled job') : 'Use the Job selector below or create a service ticket.';
        $('serviceIdentity').textContent = j ? [j.roNo ? 'RO '+j.roNo : '',j.invNo || '',j.vin ? 'VIN '+j.vin : '',j.odometer ? j.odometer+' mi' : '',j.licensePlate ? 'Plate '+j.licensePlate : ''].filter(Boolean).join(' · ') : '';
        $('serviceStatus').value = j ? (j.status || 'Open') : 'Open';
        var visibleJobs=api.filteredJobs();
        var signature=visibleJobs.map(function(x){var c=api.customer(x.customerId);return [x.id,x.title,c&&c.name].join('|');}).join('\n');
        if(ticketSignature !== signature || !$('serviceJob').options.length){
          ticketSignature=signature; $('serviceJob').replaceChildren(new Option('Select a service ticket…',''));
          visibleJobs.slice().sort(function(a,b){return new Date(b.createdAt||0)-new Date(a.createdAt||0);}).forEach(function(x){
            var customer=api.customer(x.customerId);
            $('serviceJob').appendChild(new Option((customer?customer.name:'No customer')+' — '+(x.title||'Untitled job'),x.id));
          });
        }
        $('serviceJob').value=j?j.id:'';
        $('serviceStatus').disabled = !j;
        $('serviceEditVehicle').disabled = !j;
        $('serviceSavePackage').disabled = !j;
        $('diagAppendSummary').disabled = !j;
        $('serviceRecordHint').textContent = j ? 'Worksheet saved with this ticket. Use a full JSON backup to retain shop-only records.' : 'Select a job before entering diagnostic details.';
        Object.keys(fieldMap).forEach(function(key){ $(fieldMap[key]).disabled = !j; });
      }
      function load(){
        var j = api.job();
        if(ownerId !== (j && j.id)){ setView('invoiceBuilder'); message(''); }
        ownerId = j && j.id;
        var record = j && j.diagnosticRecord;
        if(!record || typeof record !== 'object' || Array.isArray(record)) record = {};
        Object.keys(fieldMap).forEach(function(key){
          $(fieldMap[key]).value = String(record[key] || (key === 'concern' && j ? j.notes || '' : ''));
        });
        refreshContext();
        renderLibrary();
        renderHistory();
      }
      function templateLines(tpl){
        var rates = api.rates();
        return (Array.isArray(tpl.items) ? tpl.items : []).filter(function(it){
          return it && ['Labor','Diagnostic','Part','Warranty'].indexOf(it.type) !== -1;
        }).map(function(it){
          var qty = Number(it.qty == null ? 1 : it.qty);
          var cost = Number(it.cost || 0);
          var markup = Number(it.markupPct != null ? it.markupPct : (it.markup != null ? it.markup : api.partMarkup(cost)));
          var unit = it.type === 'Labor' ? rates.labor : (it.type === 'Diagnostic' ? rates.diagnostic : (it.unit == null ? api.partPrice(cost,markup) : Number(it.unit)));
          var desc = String(it.desc || '');
          if(it.vendor || it.part) desc += ' — '+[it.vendor,it.part].filter(Boolean).join(' ');
          return {type:it.type,desc:desc,qty:isFinite(qty)?qty:1,list:Number(it.list || 0),cost:cost,markupPct:markup,unit:unit,note:String(it.note || '')};
        });
      }
      function renderLibrary(){
        var query = $('servicePackageSearch').value.trim().toLowerCase();
        var templates = api.templates().filter(function(t){
          return t && (String(t.name || t.platform || '')+' '+String(t.platform || '')+' '+(Array.isArray(t.items)?t.items:[]).map(function(i){return i && i.desc || '';}).join(' ')).toLowerCase().indexOf(query) !== -1;
        });
        var container = $('servicePackages'); container.replaceChildren();
        if(!templates.length){
          var empty = document.createElement('p'); empty.className='service-empty';
          empty.textContent=query ? 'No matching shop packages. Try a different service or vehicle.' : 'Save work from a ticket to build your shop service library.';
          container.appendChild(empty); return;
        }
        templates.forEach(function(tpl){
          var lines = templateLines(tpl), j = api.job();
          var card = document.createElement('article'); card.className='service-package';
          var head = document.createElement('div'); head.className='service-package-head';
          var text = document.createElement('div');
          var title = document.createElement('h3'); title.textContent=tpl.name || tpl.platform || 'Shop package'; text.appendChild(title);
          var meta = document.createElement('p'); meta.textContent=(tpl.name ? (tpl.platform || 'All vehicles')+' · ' : '')+lines.length+' operations · Shop template'; text.appendChild(meta);
          head.appendChild(text);
          var add = document.createElement('button'); add.type='button'; add.className='tab-btn';
          add.textContent='Add to estimate'; add.disabled=!j || !lines.length;
          add.addEventListener('click', function(){
            if(!api.job()) return;
            api.persist();
            api.addLines(templateLines(tpl));
            setView('invoiceBuilder');
            message('Added '+(tpl.name || tpl.platform || 'shop package')+'. Review labor hours, parts fitment and pricing before sending.');
            api.focusLines();
          }); head.appendChild(add); card.appendChild(head);
          var details = document.createElement('details'); details.className='service-package-details';
          var summary = document.createElement('summary');
          var hours = lines.filter(function(l){return l.type==='Labor' || l.type==='Diagnostic';}).reduce(function(n,l){return n+l.qty;},0);
          var subtotal = lines.reduce(function(n,l){return n+(l.type==='Warranty'?0:l.qty*l.unit);},0);
          summary.textContent=hours.toFixed(2)+' labor/diagnostic hrs · '+api.money(subtotal)+' entered line prices'; details.appendChild(summary);
          var list = document.createElement('ul');
          lines.forEach(function(line){
            var item=document.createElement('li');
            item.textContent=line.type+' · '+line.desc+' · '+line.qty+(line.type==='Labor'||line.type==='Diagnostic'?' hrs':' qty')+' × '+api.money(line.unit);
            list.appendChild(item);
          }); details.appendChild(list); card.appendChild(details); container.appendChild(card);
        });
      }
      function renderHistory(){
        var j=api.job(), container=$('serviceHistoryList'); container.replaceChildren();
        if(!j){ $('serviceHistoryScope').textContent='Select a job to see previous service.'; return; }
        var vin=String(j.vin || '').trim().toUpperCase();
        $('serviceHistoryScope').textContent=vin ? 'Other tickets with this VIN: '+vin : 'Customer’s other tickets. Add a VIN to match one vehicle exactly.';
        var list=api.jobs().filter(function(x){return x.id!==j.id && (vin ? String(x.vin || '').trim().toUpperCase()===vin : x.customerId===j.customerId);});
        list.sort(function(a,b){return new Date(b.createdAt || 0)-new Date(a.createdAt || 0);});
        if(!list.length){ var empty=document.createElement('p'); empty.className='service-empty'; empty.textContent='No earlier matching service tickets.'; container.appendChild(empty); }
        list.forEach(function(x){
          var button=document.createElement('button'); button.type='button'; button.className='service-history-row'; button.dataset.historyJob=x.id;
          var title=document.createElement('strong'); title.textContent=x.title || 'Untitled job'; button.appendChild(title);
          var info=document.createElement('span'); info.textContent=[x.createdAt ? new Date(x.createdAt).toLocaleDateString() : '',x.invNo,x.status,api.money(api.financials(x).grand)].filter(Boolean).join(' · '); button.appendChild(info);
          button.addEventListener('click',function(){api.openJob(x.id);}); container.appendChild(button);
        });
      }
      document.querySelectorAll('[data-service-view]').forEach(function(button){
        button.addEventListener('click',function(){setView(button.dataset.serviceView);});
        button.addEventListener('keydown',function(e){
          var buttons=Array.from(document.querySelectorAll('[data-service-view]')),i=buttons.indexOf(button);
          if(['ArrowLeft','ArrowRight','Home','End'].indexOf(e.key)===-1) return;
          e.preventDefault();
          var next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
          buttons[next].click(); buttons[next].focus();
        });
      });
      $('serviceEditVehicle').addEventListener('click',function(){setView('invoiceBuilder','vehicleYear');});
      $('invJobSearch').addEventListener('input',refreshContext);
      $('invCustFilter').addEventListener('change',refreshContext);
      $('serviceJob').addEventListener('change',function(){
        if($('serviceJob').value) api.openJob($('serviceJob').value);
        else refreshContext();
      });
      $('serviceStatus').addEventListener('change',function(){
        var j=api.job(); if(!j) return;
        j.status=$('serviceStatus').value; api.persist();
        message('Work status updated. Approval and payment are managed separately.');
      });
      $('servicePackageSearch').addEventListener('input',renderLibrary);
      $('serviceSavePackage').addEventListener('click',function(){
        var j=api.job(),name=$('servicePackageName').value.trim();
        if(!j) return;
        if(!name){message('Enter a name for this service package.',true);$('servicePackageName').focus();return;}
        api.persist();
        var lines=api.rows().filter(function(l){return ['Labor','Diagnostic','Part','Warranty'].indexOf(l.type)!==-1 && String(l.desc || '').trim();});
        if(!lines.length){message('Add a described labor, diagnostic, part or warranty line before saving a package.',true);return;}
        var items=lines.map(function(l){return Object.assign({},l,{unit:l.type==='Labor'||l.type==='Diagnostic'?null:l.unit});});
        api.templates().push({id:crypto.randomUUID(),name:name,platform:$('servicePackageVehicle').value.trim() || 'All vehicles',source:'shop',createdAt:new Date().toISOString(),items:items});
        var saved=api.save(); renderLibrary(); $('servicePackageName').value='';
        message(saved===false?'Package is in memory but could not be saved. Export a backup before closing.':'Saved '+name+' to your shop library.',saved===false);
      });
      Object.keys(fieldMap).forEach(function(key){
        $(fieldMap[key]).addEventListener('input',function(){
          var j=api.job(); if(!j) return;
          var record={};
          Object.keys(fieldMap).forEach(function(k){record[k]=$(fieldMap[k]).value;});
          record.updatedAt=new Date().toISOString(); j.diagnosticRecord=record;
          api.save(); api.grow($('diagnosticWorksheet'));
        });
      });
      $('diagAppendSummary').addEventListener('click',function(){
        if(!api.job()) return;
        var fields=[['Concern','diagConcern'],['Findings','diagFindings'],['Work performed','diagCorrection'],['Verification','diagVerification']];
        var summary=fields.filter(function(pair){return $(pair[1]).value.trim();}).map(function(pair){return pair[0]+': '+$(pair[1]).value.trim();}).join('\n');
        if(!summary){message('Enter findings or work performed before creating a customer summary.',true);return;}
        var notes=$('overallNotes'); notes.value=(notes.value.trim()?notes.value.trim()+'\n\n':'')+summary;
        api.persist(); api.grow(notes.parentElement);
        message('Customer summary appended to Technician Overall Notes. Trouble-code and test notes remain shop-only.');
        setView('invoiceBuilder','overallNotes');
      });
      load();
      return {load:load,refreshContext:refreshContext,renderLibrary:renderLibrary};
    }
  };
})();
