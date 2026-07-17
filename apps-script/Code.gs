/** Pepe GO! API — despliega este archivo como Aplicación web. */
const SHEETS = { CLIENTS: 'Clientes', TRIPS: 'Viajes', PAYMENTS: 'Pagos', QUOTES: 'Cotizaciones' };
const HEADERS = {
  Clientes: ['clienteId','nombre','email','telefono','creadoEn'],
  Viajes: ['folio','clienteId','destino','hotel','pasajeros','fechaSalida','fechaRegreso','costoTotal','totalPagado','saldoPendiente','proximoPagoFecha','proximoPagoMonto','estatus','itinerarioUrl','vouchersUrl','actualizadoEn'],
  Pagos: ['pagoId','folio','fecha','monto','metodo','nota','registradoEn'],
  Cotizaciones: ['cotizacionId','fechaCreacion','clienteNombre','clienteEmail','clienteTelefono','destino','hotel','fechaSalida','fechaRegreso','personas','tipoHabitacion','planAlimentos','serviciosIncluidos','observaciones','precioTotal','anticipo','saldoPendiente','fechaLimiteReserva','fechaLiquidacion','estatus']
};

function doGet(e) { return output_(route_(e.parameter || {})); }
function doPost(e) { try { return output_(route_(JSON.parse(e.postData.contents || '{}'))); } catch (err) { return output_({ ok:false, error:'Solicitud inválida.' }); } }
function output_(body) { return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON); }
function route_(request) {
  try {
    const action = request.action, data = request.data || {};
    if (action === 'search') return { ok:true, data: findTrip_(data.query) };
    if (action === 'login') return { ok:true, data: login_(data.password) };
    requireSession_(request.token);
    if (action === 'dashboard') return { ok:true, data: dashboard_() };
    if (action === 'saveTrip') return { ok:true, data: saveTrip_(data) };
    if (action === 'registerPayment') return { ok:true, data: registerPayment_(data) };
    if (action === 'saveQuote') return { ok:true, data: saveQuote_(data) };
    if (action === 'quotes') return { ok:true, data: quotes_() };
    return { ok:false, error:'Acción no reconocida.' };
  } catch (err) { console.error(err.stack || err); return { ok:false, error: err.message || 'Ocurrió un error inesperado.' }; }
}

function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(HEADERS).forEach(name => ensureSheet_(ss, name));
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
}
function ensureSheet_(ss, name) { let sheet=ss.getSheetByName(name); if (!sheet) sheet=ss.insertSheet(name); if (sheet.getLastRow() === 0) { sheet.getRange(1,1,1,HEADERS[name].length).setValues([HEADERS[name]]); sheet.setFrozenRows(1); sheet.getRange(1,1,1,HEADERS[name].length).setFontWeight('bold').setBackground('#ffc928'); } return sheet; }
function sheet_(name) { const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'); if (!id) throw new Error('Ejecuta setupSpreadsheet una vez desde el editor de Apps Script.'); return ensureSheet_(SpreadsheetApp.openById(id), name); }
function rows_(name) { const sheet=sheet_(name), values=sheet.getDataRange().getDisplayValues(); if (values.length < 2) return []; const headers=values.shift(); return values.filter(row=>row.some(cell=>cell !== '')).map(row=>headers.reduce((obj,h,i)=>(obj[h]=row[i],obj),{})); }
function normalize_(value) { return String(value || '').trim().toLowerCase(); }
function date_(value) { if (!value) return ''; if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd'); const str=String(value); const parsed=new Date(str+'T12:00:00'); return isNaN(parsed) ? str : Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function number_(value) { const n=Number(String(value ?? '').replace(/[$,\s]/g,'')); return isFinite(n) ? n : 0; }
function id_(prefix) { return prefix+'-'+Utilities.getUuid().slice(0,8).toUpperCase(); }
function writeRow_(sheetName, record, row) { const heads=HEADERS[sheetName]; sheet_(sheetName).getRange(row || sheet_(sheetName).getLastRow()+1,1,1,heads.length).setValues([heads.map(h=>record[h] ?? '')]); }
function findTrip_(query) { const q=normalize_(query); if (!q) throw new Error('Ingresa un folio o correo electrónico.'); const trips=rows_(SHEETS.TRIPS), clients=rows_(SHEETS.CLIENTS); let trip=trips.find(t=>normalize_(t.folio) === q); if (!trip) { const client=clients.find(c=>normalize_(c.email)===q); if (client) trip=trips.filter(t=>t.clienteId===client.clienteId).sort((a,b)=>String(b.fechaSalida).localeCompare(String(a.fechaSalida)))[0]; } if (!trip) throw new Error('No encontramos un viaje con esos datos. Verifica tu folio o correo.'); const client=clients.find(c=>c.clienteId===trip.clienteId) || {}; return tripDTO_(trip,client); }
function tripDTO_(trip, client) { const total=number_(trip.costoTotal), paid=number_(trip.totalPagado), balance=Math.max(0,total-paid); return { nombre:client.nombre || 'Viajero', telefono:client.telefono || '', folio:trip.folio, destino:trip.destino, hotel:trip.hotel, pasajeros:number_(trip.pasajeros), fechaSalida:date_(trip.fechaSalida), fechaRegreso:date_(trip.fechaRegreso), costoTotal:total, totalPagado:paid, saldoPendiente:balance, proximoPagoFecha:date_(trip.proximoPagoFecha), proximoPagoMonto:number_(trip.proximoPagoMonto), estatus:trip.estatus || 'Pendiente de pago', itinerarioUrl:trip.itinerarioUrl || '', vouchersUrl:trip.vouchersUrl || '', porcentajePagado:total ? Math.min(100,Math.round(paid/total*100)) : 0 }; }

function login_(password) { const expected=PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD'); if (!expected) throw new Error('Falta configurar ADMIN_PASSWORD en las Propiedades del script.'); if (!password || password !== expected) throw new Error('Contraseña incorrecta.'); const token=Utilities.getUuid(); CacheService.getScriptCache().put('session_'+token, '1', 21600); return { token:token, expiresIn:21600 }; }
function requireSession_(token) { if (!token || !CacheService.getScriptCache().get('session_'+token)) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.'); }
function dashboard_() { const clients=rows_(SHEETS.CLIENTS), clientMap={}; clients.forEach(c=>clientMap[c.clienteId]=c); const trips=rows_(SHEETS.TRIPS).map(t=>tripDTO_(t,clientMap[t.clienteId]||{})).sort((a,b)=>String(b.fechaSalida).localeCompare(String(a.fechaSalida))); return { stats:{ viajes:trips.length, cobrado:trips.reduce((n,t)=>n+t.totalPagado,0), pendiente:trips.reduce((n,t)=>n+t.saldoPendiente,0) }, trips:trips.slice(0,50) }; }
function saveTrip_(data) { ['nombre','email','folio','destino','hotel','pasajeros','fechaSalida','fechaRegreso','costoTotal'].forEach(key=>{if (!String(data[key]||'').trim()) throw new Error('Falta el campo: '+key+'.');}); const lock=LockService.getScriptLock(); lock.waitLock(10000); try { const clients=rows_(SHEETS.CLIENTS), trips=rows_(SHEETS.TRIPS), email=normalize_(data.email), folio=String(data.folio).trim().toUpperCase(); if (trips.some(t=>normalize_(t.folio)===normalize_(folio))) throw new Error('Ese folio ya está registrado.'); let client=clients.find(c=>normalize_(c.email)===email); if (!client) { client={clienteId:id_('CLI'),nombre:data.nombre.trim(),email:data.email.trim(),telefono:String(data.telefono||'').trim(),creadoEn:new Date()}; writeRow_(SHEETS.CLIENTS,client); } else { client.nombre=data.nombre.trim(); client.telefono=String(data.telefono||'').trim(); const row=clients.findIndex(c=>c.clienteId===client.clienteId)+2; writeRow_(SHEETS.CLIENTS,client,row); } const total=number_(data.costoTotal); const trip={folio:folio,clienteId:client.clienteId,destino:data.destino.trim(),hotel:data.hotel.trim(),pasajeros:number_(data.pasajeros),fechaSalida:date_(data.fechaSalida),fechaRegreso:date_(data.fechaRegreso),costoTotal:total,totalPagado:0,saldoPendiente:total,proximoPagoFecha:date_(data.proximoPagoFecha),proximoPagoMonto:number_(data.proximoPagoMonto),estatus:data.estatus||'Pendiente de pago',itinerarioUrl:String(data.itinerarioUrl||'').trim(),vouchersUrl:String(data.vouchersUrl||'').trim(),actualizadoEn:new Date()}; writeRow_(SHEETS.TRIPS,trip); return {folio:folio}; } finally { lock.releaseLock(); } }
function registerPayment_(data) { ['folio','fecha','monto','metodo'].forEach(key=>{if (!String(data[key]||'').trim()) throw new Error('Falta el campo: '+key+'.');}); const amount=number_(data.monto); if (amount<=0) throw new Error('El monto debe ser mayor a cero.'); const lock=LockService.getScriptLock(); lock.waitLock(10000); try { const trips=rows_(SHEETS.TRIPS), rowIndex=trips.findIndex(t=>normalize_(t.folio)===normalize_(data.folio)); if (rowIndex<0) throw new Error('No existe un viaje con ese folio.'); const trip=trips[rowIndex], newPaid=number_(trip.totalPagado)+amount, total=number_(trip.costoTotal); if (newPaid>total) throw new Error('El pago excede el costo total del viaje.'); writeRow_(SHEETS.PAYMENTS,{pagoId:id_('PAG'),folio:trip.folio,fecha:date_(data.fecha),monto:amount,metodo:data.metodo,nota:data.nota||'',registradoEn:new Date()}); trip.totalPagado=newPaid; trip.saldoPendiente=Math.max(0,total-newPaid); if (trip.saldoPendiente===0) { trip.proximoPagoFecha=''; trip.proximoPagoMonto=''; } trip.actualizadoEn=new Date(); writeRow_(SHEETS.TRIPS,trip,rowIndex+2); return tripDTO_(trip,{}); } finally { lock.releaseLock(); } }

function saveQuote_(data) {
  ['clienteNombre','clienteEmail','clienteTelefono','destino','hotel','fechaSalida','fechaRegreso','personas','tipoHabitacion','planAlimentos','serviciosIncluidos','precioTotal','anticipo','fechaLimiteReserva','fechaLiquidacion'].forEach(key=>{if (data[key]===undefined || data[key]===null || !String(data[key]).trim()) throw new Error('Falta el campo: '+key+'.');});
  const total=number_(data.precioTotal), deposit=number_(data.anticipo), people=number_(data.personas);
  if (total<=0) throw new Error('El precio total debe ser mayor a cero.');
  if (deposit<0 || deposit>total) throw new Error('El anticipo debe estar entre cero y el precio total.');
  if (people<1 || Math.floor(people)!==people) throw new Error('El número de personas debe ser un entero mayor a cero.');
  if (date_(data.fechaRegreso)<date_(data.fechaSalida)) throw new Error('La fecha de regreso no puede ser anterior a la fecha de salida.');
  const record={cotizacionId:id_('COT'),fechaCreacion:new Date(),clienteNombre:String(data.clienteNombre).trim(),clienteEmail:String(data.clienteEmail).trim(),clienteTelefono:String(data.clienteTelefono).trim(),destino:String(data.destino).trim(),hotel:String(data.hotel).trim(),fechaSalida:date_(data.fechaSalida),fechaRegreso:date_(data.fechaRegreso),personas:people,tipoHabitacion:String(data.tipoHabitacion).trim(),planAlimentos:String(data.planAlimentos).trim(),serviciosIncluidos:String(data.serviciosIncluidos).trim(),observaciones:String(data.observaciones||'').trim(),precioTotal:total,anticipo:deposit,saldoPendiente:Math.max(0,total-deposit),fechaLimiteReserva:date_(data.fechaLimiteReserva),fechaLiquidacion:date_(data.fechaLiquidacion),estatus:'Borrador'};
  const lock=LockService.getScriptLock(); lock.waitLock(10000);
  try { writeRow_(SHEETS.QUOTES,record); return {cotizacionId:record.cotizacionId,estatus:record.estatus}; }
  finally { lock.releaseLock(); }
}

function quotes_() { return rows_(SHEETS.QUOTES).reverse().slice(0,100); }
