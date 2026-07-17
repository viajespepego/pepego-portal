/** Pepe GO! API — despliega este archivo como Aplicación web. */
const SHEETS = { CLIENTS: 'Clientes', TRIPS: 'Viajes', PAYMENTS: 'Pagos', QUOTES: 'Cotizaciones' };
const HEADERS = {
  Clientes: ['clienteId','nombre','email','telefono','creadoEn'],
  Viajes: ['folio','clienteId','destino','hotel','pasajeros','fechaSalida','fechaRegreso','costoTotal','totalPagado','saldoPendiente','proximoPagoFecha','proximoPagoMonto','estatus','itinerarioUrl','vouchersUrl','actualizadoEn','cotizacionId','adultos','menores','edadesMenores','habitacionesJson','destinosJson','serviciosIncluidos','observaciones','imagenesJson'],
  Pagos: ['pagoId','folio','fecha','monto','metodo','nota','registradoEn','cotizacionId'],
  Cotizaciones: ['cotizacionId','fechaCreacion','clienteNombre','clienteEmail','clienteTelefono','destino','hotel','fechaSalida','fechaRegreso','personas','tipoHabitacion','planAlimentos','serviciosIncluidos','observaciones','precioTotal','anticipo','saldoPendiente','fechaLimiteReserva','fechaLiquidacion','estatus','codigoBaseReserva','folioViaje','adultos','menores','edadesMenores','habitacionesJson','destinosJson','imagen1Url','imagen1Titulo','imagen2Url','imagen2Titulo','imagen3Url','imagen3Titulo','imagen4Url','imagen4Titulo','convertidoEnViaje','fechaConversion']
};

function doGet(e) { return output_(route_(e.parameter || {})); }
function doPost(e) { try { return output_(route_(JSON.parse(e.postData.contents || '{}'))); } catch (err) { return output_({ ok:false, error:'Solicitud inválida.' }); } }
function output_(body) { return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON); }

function route_(request) {
  try {
    const action=request.action, data=request.data || {};
    if (action==='search') return {ok:true,data:findTrip_(data.query)};
    if (action==='login') return {ok:true,data:login_(data.password)};
    requireSession_(request.token);
    if (action==='dashboard') return {ok:true,data:dashboard_()};
    if (action==='saveTrip') return {ok:true,data:saveTrip_(data)};
    if (action==='registerPayment') return {ok:true,data:registerPayment_(data)};
    if (action==='saveQuote') return {ok:true,data:saveQuote_(data)};
    if (action==='acceptQuote') return {ok:true,data:acceptQuote_(data)};
    if (action==='quotes') return {ok:true,data:quotes_()};
    return {ok:false,error:'Acción no reconocida.'};
  } catch (err) { console.error(err.stack || err); return {ok:false,error:err.message || 'Ocurrió un error inesperado.'}; }
}

function setupSpreadsheet() {
  const ss=SpreadsheetApp.getActive();
  Object.keys(HEADERS).forEach(name=>ensureSheet_(ss,name));
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID',ss.getId());
}

function ensureSheet_(ss,name) {
  let sheet=ss.getSheetByName(name);
  let changed=false;
  if (!sheet) { sheet=ss.insertSheet(name); changed=true; }
  const expected=HEADERS[name];
  if (sheet.getMaxColumns()<expected.length) { sheet.insertColumnsAfter(sheet.getMaxColumns(),expected.length-sheet.getMaxColumns()); changed=true; }
  if (sheet.getLastRow()===0) {
    sheet.getRange(1,1,1,expected.length).setValues([expected]);
    changed=true;
  } else {
    const current=sheet.getRange(1,1,1,Math.max(1,sheet.getLastColumn())).getDisplayValues()[0];
    while (current.length && !current[current.length-1]) current.pop();
    const missing=expected.filter(header=>!current.includes(header));
    if (missing.length) {
      const needed=current.length+missing.length;
      if (sheet.getMaxColumns()<needed) sheet.insertColumnsAfter(sheet.getMaxColumns(),needed-sheet.getMaxColumns());
      sheet.getRange(1,current.length+1,1,missing.length).setValues([missing]);
      changed=true;
    }
  }
  if (changed) { sheet.setFrozenRows(1); sheet.getRange(1,1,1,sheet.getLastColumn()).setFontWeight('bold').setBackground('#ffc928'); }
  return sheet;
}

function sheet_(name) { const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'); if (!id) throw new Error('Ejecuta setupSpreadsheet una vez desde el editor de Apps Script.'); return ensureSheet_(SpreadsheetApp.openById(id),name); }
function sheetHeaders_(name) { const sheet=sheet_(name); return sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0]; }
function rows_(name) { const sheet=sheet_(name),values=sheet.getDataRange().getDisplayValues(); if (values.length<2) return []; const headers=values.shift(); return values.filter(row=>row.some(cell=>cell!=='')).map(row=>headers.reduce((obj,header,index)=>(obj[header]=row[index],obj),{})); }
function writeRow_(name,record,row) { const sheet=sheet_(name),headers=sheetHeaders_(name),target=row || sheet.getLastRow()+1; sheet.getRange(target,1,1,headers.length).setValues([headers.map(header=>record[header] ?? '')]); }
function normalize_(value) { return String(value || '').trim().toLowerCase(); }
function clean_(value) { return String(value ?? '').trim(); }
function date_(value) { if (!value) return ''; if (Object.prototype.toString.call(value)==='[object Date]' && !isNaN(value)) return Utilities.formatDate(value,Session.getScriptTimeZone(),'yyyy-MM-dd'); const str=String(value).slice(0,10),parsed=new Date(str+'T12:00:00'); return isNaN(parsed) ? str : Utilities.formatDate(parsed,Session.getScriptTimeZone(),'yyyy-MM-dd'); }
function number_(value) { const parsed=Number(String(value ?? '').replace(/[$,\s]/g,'')); return isFinite(parsed) ? parsed : 0; }
function integer_(value) { return Math.max(0,Math.floor(number_(value))); }
function id_(prefix) { return prefix+'-'+Utilities.getUuid().slice(0,8).toUpperCase(); }
function jsonArray_(value) { if (Array.isArray(value)) return value; try { const parsed=JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch (_) { return []; } }
function jsonString_(value) { return JSON.stringify(jsonArray_(value)); }
function truthy_(value) { return value===true || normalize_(value)==='true' || normalize_(value)==='sí' || normalize_(value)==='si'; }

function findTrip_(query) {
  const q=normalize_(query);
  if (!q) throw new Error('Ingresa un folio o correo electrónico.');
  const trips=rows_(SHEETS.TRIPS),clients=rows_(SHEETS.CLIENTS);
  let trip=trips.find(item=>normalize_(item.folio)===q);
  if (!trip) { const client=clients.find(item=>normalize_(item.email)===q); if (client) trip=trips.filter(item=>item.clienteId===client.clienteId).sort((a,b)=>String(b.fechaSalida).localeCompare(String(a.fechaSalida)))[0]; }
  if (!trip) throw new Error('No encontramos un viaje con esos datos. Verifica tu folio o correo.');
  return tripDTO_(trip,clients.find(client=>client.clienteId===trip.clienteId) || {});
}

function tripDTO_(trip,client) {
  const total=number_(trip.costoTotal),paid=number_(trip.totalPagado),balance=Math.max(0,total-paid);
  return {nombre:client.nombre || 'Viajero',telefono:client.telefono || '',folio:trip.folio,destino:trip.destino,hotel:trip.hotel,pasajeros:number_(trip.pasajeros),adultos:integer_(trip.adultos),menores:integer_(trip.menores),edadesMenores:jsonArray_(trip.edadesMenores),fechaSalida:date_(trip.fechaSalida),fechaRegreso:date_(trip.fechaRegreso),costoTotal:total,totalPagado:paid,saldoPendiente:balance,proximoPagoFecha:date_(trip.proximoPagoFecha),proximoPagoMonto:number_(trip.proximoPagoMonto),estatus:trip.estatus || 'Pendiente de pago',itinerarioUrl:trip.itinerarioUrl || '',vouchersUrl:trip.vouchersUrl || '',porcentajePagado:total ? Math.min(100,Math.round(paid/total*100)) : 0,habitaciones:jsonArray_(trip.habitacionesJson),destinos:jsonArray_(trip.destinosJson),serviciosIncluidos:trip.serviciosIncluidos || '',observaciones:trip.observaciones || '',imagenes:jsonArray_(trip.imagenesJson)};
}

function login_(password) { const expected=PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD'); if (!expected) throw new Error('Falta configurar ADMIN_PASSWORD en las Propiedades del script.'); if (!password || password!==expected) throw new Error('Contraseña incorrecta.'); const token=Utilities.getUuid(); CacheService.getScriptCache().put('session_'+token,'1',21600); return {token:token,expiresIn:21600}; }
function requireSession_(token) { if (!token || !CacheService.getScriptCache().get('session_'+token)) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.'); }
function dashboard_() { const clients=rows_(SHEETS.CLIENTS),clientMap={}; clients.forEach(client=>clientMap[client.clienteId]=client); const trips=rows_(SHEETS.TRIPS).map(trip=>tripDTO_(trip,clientMap[trip.clienteId] || {})).sort((a,b)=>String(b.fechaSalida).localeCompare(String(a.fechaSalida))); return {stats:{viajes:trips.length,cobrado:trips.reduce((sum,trip)=>sum+trip.totalPagado,0),pendiente:trips.reduce((sum,trip)=>sum+trip.saldoPendiente,0)},trips:trips.slice(0,50)}; }

function saveTrip_(data) {
  ['nombre','email','folio','destino','hotel','pasajeros','fechaSalida','fechaRegreso','costoTotal'].forEach(key=>{if (!clean_(data[key])) throw new Error('Falta el campo: '+key+'.');});
  const lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const clients=rows_(SHEETS.CLIENTS),trips=rows_(SHEETS.TRIPS),email=normalize_(data.email),folio=clean_(data.folio).toUpperCase();
    if (trips.some(trip=>normalize_(trip.folio)===normalize_(folio))) throw new Error('Ese folio ya está registrado.');
    let client=clients.find(item=>normalize_(item.email)===email);
    if (!client) { client={clienteId:id_('CLI'),nombre:clean_(data.nombre),email:clean_(data.email),telefono:clean_(data.telefono),creadoEn:new Date()}; writeRow_(SHEETS.CLIENTS,client); }
    else { client.nombre=clean_(data.nombre); client.telefono=clean_(data.telefono); writeRow_(SHEETS.CLIENTS,client,clients.findIndex(item=>item.clienteId===client.clienteId)+2); }
    const total=number_(data.costoTotal),trip={folio:folio,clienteId:client.clienteId,destino:clean_(data.destino),hotel:clean_(data.hotel),pasajeros:number_(data.pasajeros),fechaSalida:date_(data.fechaSalida),fechaRegreso:date_(data.fechaRegreso),costoTotal:total,totalPagado:0,saldoPendiente:total,proximoPagoFecha:date_(data.proximoPagoFecha),proximoPagoMonto:number_(data.proximoPagoMonto),estatus:data.estatus || 'Pendiente de pago',itinerarioUrl:clean_(data.itinerarioUrl),vouchersUrl:clean_(data.vouchersUrl),actualizadoEn:new Date()};
    writeRow_(SHEETS.TRIPS,trip); return {folio:folio};
  } finally { lock.releaseLock(); }
}

function registerPayment_(data) {
  ['folio','fecha','monto','metodo'].forEach(key=>{if (!clean_(data[key])) throw new Error('Falta el campo: '+key+'.');});
  const amount=number_(data.monto); if (amount<=0) throw new Error('El monto debe ser mayor a cero.');
  const lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const trips=rows_(SHEETS.TRIPS),rowIndex=trips.findIndex(trip=>normalize_(trip.folio)===normalize_(data.folio));
    if (rowIndex<0) throw new Error('No existe un viaje con ese folio.');
    const trip=trips[rowIndex],newPaid=number_(trip.totalPagado)+amount,total=number_(trip.costoTotal);
    if (newPaid>total) throw new Error('El pago excede el costo total del viaje.');
    writeRow_(SHEETS.PAYMENTS,{pagoId:id_('PAG'),folio:trip.folio,fecha:date_(data.fecha),monto:amount,metodo:data.metodo,nota:data.nota || '',registradoEn:new Date(),cotizacionId:''});
    trip.totalPagado=newPaid; trip.saldoPendiente=Math.max(0,total-newPaid); if (trip.saldoPendiente===0) { trip.proximoPagoFecha=''; trip.proximoPagoMonto=''; } trip.actualizadoEn=new Date();
    writeRow_(SHEETS.TRIPS,trip,rowIndex+2); return tripDTO_(trip,{});
  } finally { lock.releaseLock(); }
}

function quoteRecord_(data,existing) {
  const record=Object.assign({},existing || {}),destinations=jsonArray_(data.destinosJson),rooms=jsonArray_(data.habitacionesJson),images=Array.isArray(data.imagenes) ? data.imagenes.slice(0,4) : [1,2,3,4].map(index=>({url:data['imagen'+index+'Url'],titulo:data['imagen'+index+'Titulo']}));
  const firstDestination=destinations[0] || {},lastDestination=destinations[destinations.length-1] || {},firstRoom=rooms[0] || {};
  record.cotizacionId=clean_(data.cotizacionId) || record.cotizacionId || id_('COT');
  record.fechaCreacion=record.fechaCreacion || new Date();
  record.clienteNombre=clean_(data.clienteNombre); record.clienteEmail=clean_(data.clienteEmail); record.clienteTelefono=clean_(data.clienteTelefono);
  record.destino=clean_(data.destino) || clean_(firstDestination.ciudad || firstDestination.destino); record.hotel=clean_(data.hotel) || clean_(firstDestination.hotel);
  record.fechaSalida=date_(data.fechaSalida || firstDestination.fechaLlegada); record.fechaRegreso=date_(data.fechaRegreso || lastDestination.fechaSalida);
  record.adultos=integer_(data.adultos); record.menores=integer_(data.menores); record.personas=record.adultos+record.menores;
  record.edadesMenores=jsonString_(data.edadesMenores); record.habitacionesJson=JSON.stringify(rooms); record.destinosJson=JSON.stringify(destinations);
  record.tipoHabitacion=clean_(data.tipoHabitacion) || clean_(firstRoom.tipo || firstDestination.tipoHabitacion); record.planAlimentos=clean_(data.planAlimentos) || clean_(firstRoom.regimen || firstDestination.regimenAlimentos);
  record.serviciosIncluidos=clean_(data.serviciosIncluidos); record.observaciones=clean_(data.observaciones);
  record.precioTotal=number_(data.precioTotal); record.anticipo=Math.max(0,number_(data.anticipo)); record.saldoPendiente=Math.max(0,record.precioTotal-record.anticipo);
  record.fechaLimiteReserva=date_(data.fechaLimiteReserva); record.fechaLiquidacion=date_(data.fechaLiquidacion);
  record.codigoBaseReserva=clean_(data.codigoBaseReserva).toUpperCase().replace(/\s+/g,''); record.folioViaje=clean_(data.folioViaje || record.folioViaje).toUpperCase();
  record.estatus=clean_(data.estatus) || record.estatus || 'Borrador';
  for (let index=1;index<=4;index++) { const image=images[index-1] || {}; record['imagen'+index+'Url']=clean_(image.url); record['imagen'+index+'Titulo']=clean_(image.titulo); }
  record.convertidoEnViaje=truthy_(record.convertidoEnViaje); record.fechaConversion=record.fechaConversion || '';
  return record;
}

function saveQuote_(data) { return saveQuoteTransaction_(data,false); }
function acceptQuote_(data) { return saveQuoteTransaction_(data,true); }

function saveQuoteTransaction_(data,forceConvert) {
  const lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const quotes=rows_(SHEETS.QUOTES),quoteIndex=clean_(data.cotizacionId) ? quotes.findIndex(item=>item.cotizacionId===clean_(data.cotizacionId)) : -1;
    const existing=quoteIndex>=0 ? quotes[quoteIndex] : null,record=quoteRecord_(data,existing);
    const shouldConvert=forceConvert || normalize_(record.estatus)==='aceptada' || truthy_(existing && existing.convertidoEnViaje);
    if (shouldConvert) convertQuoteToTrip_(record);
    writeRow_(SHEETS.QUOTES,record,quoteIndex>=0 ? quoteIndex+2 : undefined);
    return {cotizacionId:record.cotizacionId,estatus:record.estatus,folioViaje:record.folioViaje || '',convertidoEnViaje:record.convertidoEnViaje};
  } finally { lock.releaseLock(); }
}

function findReusableClient_(clients,record,trip) {
  if (trip && trip.clienteId) { const byId=clients.find(client=>client.clienteId===trip.clienteId); if (byId) return byId; }
  const email=normalize_(record.clienteEmail),phone=String(record.clienteTelefono || '').replace(/\D/g,''),name=normalize_(record.clienteNombre);
  return clients.find(client=>(email && normalize_(client.email)===email) || (phone && String(client.telefono || '').replace(/\D/g,'')===phone) || (!email && !phone && name && normalize_(client.nombre)===name));
}

function convertQuoteToTrip_(record) {
  const base=clean_(record.codigoBaseReserva).toUpperCase().replace(/\s+/g,'');
  if (!base) throw new Error('Escribe el código base de reserva antes de aceptar.');
  const folio=base+'-1';
  if (truthy_(record.convertidoEnViaje) && record.folioViaje && normalize_(record.folioViaje)!==normalize_(folio)) throw new Error('El código base no puede cambiarse después de crear la reserva.');
  const trips=rows_(SHEETS.TRIPS),tripIndex=trips.findIndex(item=>normalize_(item.folio)===normalize_(folio)),existingTrip=tripIndex>=0 ? trips[tripIndex] : null;
  if (existingTrip && existingTrip.cotizacionId!==record.cotizacionId) throw new Error('Ya existe un viaje con el folio '+folio+'. No se creó una reserva duplicada.');

  const clients=rows_(SHEETS.CLIENTS); let client=findReusableClient_(clients,record,existingTrip),clientIndex=client ? clients.findIndex(item=>item.clienteId===client.clienteId) : -1;
  if (!client) client={clienteId:id_('CLI'),creadoEn:new Date()};
  client.nombre=record.clienteNombre; client.email=record.clienteEmail; client.telefono=record.clienteTelefono;
  writeRow_(SHEETS.CLIENTS,client,clientIndex>=0 ? clientIndex+2 : undefined);

  const destinations=jsonArray_(record.destinosJson),rooms=jsonArray_(record.habitacionesJson),first=destinations[0] || {},last=destinations[destinations.length-1] || {},payments=rows_(SHEETS.PAYMENTS);
  const initialNote='Anticipo de cotización '+record.cotizacionId;
  const initialPaymentIndex=payments.findIndex(payment=>payment.cotizacionId===record.cotizacionId || (normalize_(payment.folio)===normalize_(folio) && payment.nota===initialNote));
  const otherPaid=payments.reduce((sum,payment,index)=>sum+(index===initialPaymentIndex || normalize_(payment.folio)!==normalize_(folio) ? 0 : number_(payment.monto)),0);
  if (record.anticipo>0 || initialPaymentIndex>=0) {
    const payment=initialPaymentIndex>=0 ? payments[initialPaymentIndex] : {pagoId:id_('PAG'),registradoEn:new Date()};
    payment.folio=folio; payment.fecha=payment.fecha || date_(new Date()); payment.monto=record.anticipo; payment.metodo='Anticipo'; payment.nota=initialNote; payment.cotizacionId=record.cotizacionId;
    writeRow_(SHEETS.PAYMENTS,payment,initialPaymentIndex>=0 ? initialPaymentIndex+2 : undefined);
  }
  const totalPaid=otherPaid+record.anticipo,balance=Math.max(0,record.precioTotal-totalPaid),images=[1,2,3,4].map(index=>({url:record['imagen'+index+'Url'],titulo:record['imagen'+index+'Titulo']})).filter(image=>image.url || image.titulo);
  const trip=Object.assign({},existingTrip || {},{
    folio:folio,clienteId:client.clienteId,destino:record.destino || clean_(first.ciudad || first.destino),hotel:record.hotel || clean_(first.hotel),pasajeros:record.personas,fechaSalida:record.fechaSalida || date_(first.fechaLlegada),fechaRegreso:record.fechaRegreso || date_(last.fechaSalida),costoTotal:record.precioTotal,totalPagado:totalPaid,saldoPendiente:balance,proximoPagoFecha:balance>0 ? record.fechaLiquidacion : '',proximoPagoMonto:balance,estatus:existingTrip && existingTrip.estatus ? existingTrip.estatus : 'Confirmado',itinerarioUrl:existingTrip ? existingTrip.itinerarioUrl : '',vouchersUrl:existingTrip ? existingTrip.vouchersUrl : '',actualizadoEn:new Date(),cotizacionId:record.cotizacionId,adultos:record.adultos,menores:record.menores,edadesMenores:record.edadesMenores,habitacionesJson:JSON.stringify(rooms),destinosJson:JSON.stringify(destinations),serviciosIncluidos:record.serviciosIncluidos,observaciones:record.observaciones,imagenesJson:JSON.stringify(images)
  });
  writeRow_(SHEETS.TRIPS,trip,tripIndex>=0 ? tripIndex+2 : undefined);
  record.codigoBaseReserva=base; record.folioViaje=folio; record.estatus='Aceptada'; record.convertidoEnViaje=true; record.fechaConversion=record.fechaConversion || new Date();
}

function quotes_() { return rows_(SHEETS.QUOTES).reverse().slice(0,200); }
