/* Additive vehicle relationships. Invoice fields remain historical job snapshots. */
(function(root){
  'use strict';
  function vin(value){ return String(value || '').trim().toUpperCase(); }
  function validVin(value){ return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin(value)); }
  function id(){ return 'veh-'+crypto.randomUUID(); }
  function jobsFor(db,vehicleId){ return db.jobs.filter(function(j){return j.vehicleId===vehicleId;}); }
  function find(db,vehicleId){ return (db.vehicles || []).find(function(v){return v.id===vehicleId;}) || null; }
  function stamp(j){ return j.createdAt || ''; }
  function ordered(jobs){ return jobs.slice().sort(function(a,b){return stamp(b).localeCompare(stamp(a));}); }
  var fields={year:'vehicleYear',make:'vehicleMake',model:'vehicleModel',engine:'vehicleEngine',plate:'licensePlate'};
  function validCollection(value){
    if(value==null)return true;
    return Array.isArray(value) && value.every(function(v){
      return v && typeof v==='object' && !Array.isArray(v) &&
        (v.customerIds==null || Array.isArray(v.customerIds)) &&
        (v.recommendations==null || (Array.isArray(v.recommendations) && v.recommendations.every(function(r){return r && typeof r==='object' && !Array.isArray(r);}))) ;
    });
  }
  function hasIdentity(j){ return !!(vin(j.vin) || Object.keys(fields).some(function(key){return String(j[fields[key]] || '').trim();})); }
  function normalize(v){
    if(!v.id) v.id=id();
    if(!Array.isArray(v.customerIds)) v.customerIds=[];
    if(!Array.isArray(v.recommendations)) v.recommendations=[];
    if(typeof v.technicalNotes!=='string') v.technicalNotes='';
    if(!v.createdAt) v.createdAt=new Date().toISOString();
    v.vin=vin(v.vin);
    return v;
  }
  function upgrade(db){
    if(!validCollection(db.vehicles)) throw new Error('Vehicle records have an invalid structure');
    if(!db.vehicles) db.vehicles=[];
    db.vehicles.forEach(normalize);
    ordered(db.jobs).forEach(function(j){
      var key=vin(j.vin), v=find(db,j.vehicleId);
      // Changing a ticket's VIN must not rename a different vehicle's history.
      if(v && key && v.vin && key!==v.vin) v=null;
      if(!v && validVin(key)){
        var matches=db.vehicles.filter(function(x){return x.vin===key;});
        if(matches.length===1) v=matches[0];
      }
      if(!v && hasIdentity(j)){
        v=normalize({id:id(),vin:key,createdAt:j.createdAt || new Date().toISOString(),identitySourceJobId:j.id});
        db.vehicles.push(v);
      }
      if(!v){ if(j.vehicleId && !find(db,j.vehicleId)) delete j.vehicleId; return; }
      j.vehicleId=v.id;
      if(!v.vin && key) v.vin=key;
      if(j.customerId && v.customerIds.indexOf(j.customerId)===-1) v.customerIds.push(j.customerId);
    });
    db.customers.forEach(function(c){
      if(!String(c.vehicle || '').trim() || db.vehicles.some(function(v){return v.customerIds.indexOf(c.id)!==-1;})) return;
      db.vehicles.push(normalize({id:id(),label:String(c.vehicle).trim(),customerIds:[c.id],identitySourceCustomerId:c.id}));
    });
    db.vehicles.forEach(function(v){
      var history=ordered(jobsFor(db,v.id));
      // Use the latest recorded identity without overwriting a job's original fields.
      Object.keys(fields).forEach(function(key){
        var source=history.find(function(j){return String(j[fields[key]] || '').trim();});
        if(source) v[key]=String(source[fields[key]]).trim();
      });
    });
    db.shopOsSchemaVersion=Math.max(Number(db.shopOsSchemaVersion)||0,1);
    return db;
  }
  function label(v){ return [v.year,v.make,v.model,v.engine].filter(Boolean).join(' ') || v.label || (v.vin ? 'Vehicle '+v.vin : 'Vehicle identity not recorded'); }
  function mileage(db,vehicleId){
    return ordered(jobsFor(db,vehicleId)).filter(function(j){return j.odometer!=='' && j.odometer!=null && isFinite(Number(j.odometer)) && Number(j.odometer)>=0;}).map(function(j){
      return {value:Number(j.odometer),date:j.createdAt || '',jobId:j.id,title:j.title || 'Service ticket'};
    });
  }
  function register(db,record){
    upgrade(db);
    var key=vin(record.vin), existing=key && db.vehicles.find(function(v){return v.vin===key;});
    if(existing) return {vehicle:existing,created:false};
    var v=normalize(Object.assign({},record,{id:id(),vin:key,createdAt:new Date().toISOString()}));
    db.vehicles.push(v);
    return {vehicle:v,created:true};
  }
  function link(db,job,vehicleId){
    var v=find(db,vehicleId);
    if(!v || !job) return {ok:false,message:'Select a vehicle and an open ticket.'};
    if(vin(job.vin) && v.vin && vin(job.vin)!==v.vin) return {ok:false,message:'The ticket VIN differs from this vehicle. Correct the vehicle identity before linking.'};
    // An identity-less record cannot establish a shared VIN from just one ticket
    // when its other tickets already have different VINs.
    if(vin(job.vin) && !v.vin && jobsFor(db,v.id).some(function(j){return vin(j.vin) && vin(j.vin)!==vin(job.vin);})) return {ok:false,message:'Existing ticket VINs conflict. Review the vehicle identity before linking.'};
    job.vehicleId=v.id;
    if(!vin(job.vin) && v.vin) job.vin=v.vin;
    Object.keys(fields).forEach(function(key){if(!String(job[fields[key]] || '').trim() && v[key]) job[fields[key]]=v[key];});
    upgrade(db);
    return {ok:true};
  }
  var api={upgrade:upgrade,find:find,jobs:jobsFor,ordered:ordered,label:label,mileage:mileage,register:register,link:link,vin:vin,validVin:validVin,validCollection:validCollection};
  root.PdcVehicleRecords=api;
  if(typeof module!=='undefined' && module.exports) module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
