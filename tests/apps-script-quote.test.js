const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createSheet(name, headers = []) {
  const rows = headers.length ? [headers.slice()] : [];
  let maxColumns = 26;
  const getRange = (row, column, rowCount, columnCount) => ({
    getDisplayValues: () => Array.from({ length: rowCount }, (_, rowOffset) => Array.from({ length: columnCount }, (_, columnOffset) => String(rows[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? ''))),
    setValues: values => {
      values.forEach((sourceRow, rowOffset) => {
        rows[row - 1 + rowOffset] ||= [];
        sourceRow.forEach((value, columnOffset) => { rows[row - 1 + rowOffset][column - 1 + columnOffset] = value; });
      });
      return getRange(row, column, rowCount, columnCount);
    },
    setFontWeight: () => getRange(row, column, rowCount, columnCount),
    setBackground: () => getRange(row, column, rowCount, columnCount)
  });
  return {
    name, rows,
    getMaxColumns: () => maxColumns,
    insertColumnsAfter: (_after, count) => { maxColumns += count; },
    getLastColumn: () => Math.max(1, rows[0]?.length || 0),
    getLastRow: () => rows.length,
    getRange,
    getDataRange: () => ({ getDisplayValues: () => rows.map(sourceRow => sourceRow.map(value => value instanceof Date ? value.toISOString() : String(value ?? ''))) }),
    setFrozenRows: () => {}
  };
}

const originalQuoteHeaders = ['cotizacionId','fechaCreacion','clienteNombre','clienteEmail','clienteTelefono','destino','hotel','fechaSalida','fechaRegreso','personas','tipoHabitacion','planAlimentos','serviciosIncluidos','observaciones','precioTotal','anticipo','saldoPendiente','fechaLimiteReserva','fechaLiquidacion','estatus'];
const sheets = { Cotizaciones: createSheet('Cotizaciones', originalQuoteHeaders) };
const spreadsheet = { getId: () => 'SHEET-ID', getSheetByName: name => sheets[name] || null, insertSheet: name => (sheets[name] = createSheet(name)) };
let uuid = 0;
const context = {
  console,
  SpreadsheetApp: { getActive: () => spreadsheet, openById: () => spreadsheet },
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'SPREADSHEET_ID' ? 'SHEET-ID' : 'secret', setProperty: () => {} }) },
  Utilities: { getUuid: () => `${String(++uuid).padStart(8, '0')}-ABCD-EFGH`, formatDate: date => date.toISOString().slice(0, 10) },
  Session: { getScriptTimeZone: () => 'America/Mexico_City' },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  CacheService: { getScriptCache: () => ({ get: () => '1', put: () => {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: () => ({ setMimeType() { return this; } }) }
};

vm.createContext(context);
vm.runInContext(fs.readFileSync('apps-script/Code.gs', 'utf8'), context);
context.setupSpreadsheet();

assert.equal(sheets.Cotizaciones.rows[0].length, 37);
assert.ok(sheets.Cotizaciones.rows[0].includes('destinosJson'));

const draft = context.saveQuote_({ precioTotal: 0, habitacionesJson: [], destinosJson: [], imagenes: [] });
assert.ok(draft.cotizacionId);

const acceptedData = {
  cotizacionId: draft.cotizacionId,
  codigoBaseReserva: ' go 07 n015 ',
  estatus: 'Aceptada',
  clienteNombre: 'Ana', clienteEmail: 'ana@example.com', clienteTelefono: '555',
  adultos: 2, menores: 1, edadesMenores: [7],
  habitacionesJson: [{ numero: 1, tipo: 'Deluxe', regimen: 'Todo incluido', adultos: 2, menores: 1 }],
  destinosJson: [{ ciudad: 'Cancún', hotel: 'Caribe', fechaLlegada: '2026-08-01', fechaSalida: '2026-08-05', noches: 4, transporte: 'vuelo', vuelo: { aerolinea: 'MX', numeroVuelo: '123' } }],
  precioTotal: 1000, anticipo: 200, serviciosIncluidos: 'Hotel'
};

const firstAcceptance = context.acceptQuote_(acceptedData);
const secondAcceptance = context.acceptQuote_(acceptedData);
assert.equal(firstAcceptance.folioViaje, 'GO07N015-1');
assert.equal(secondAcceptance.folioViaje, 'GO07N015-1');
assert.equal(context.rows_('Clientes').length, 1);
assert.equal(context.rows_('Viajes').length, 1);
assert.equal(context.rows_('Pagos').length, 1);

context.saveQuote_({ ...acceptedData, anticipo: 300, destinosJson: [...acceptedData.destinosJson, { ciudad: 'Mérida', hotel: 'Centro', fechaLlegada: '2026-08-05', fechaSalida: '2026-08-07', noches: 2 }] });
const editedTrip = context.rows_('Viajes')[0];
assert.equal(JSON.parse(editedTrip.destinosJson).length, 2);
assert.equal(context.rows_('Pagos')[0].monto, '300');
assert.throws(() => context.saveQuote_({ ...acceptedData, codigoBaseReserva: 'OTRO' }), /no puede cambiarse/);

context.writeRow_('Viajes', { folio: 'DUP-1', clienteId: 'OTHER' });
assert.throws(() => context.acceptQuote_({ codigoBaseReserva: ' dup ', estatus: 'Aceptada' }), /Ya existe un viaje/);
assert.throws(() => context.acceptQuote_({ codigoBaseReserva: 'dup', folioViaje: 'DUP-1', estatus: 'Aceptada' }), /Ya existe un viaje/);

console.log('Cotizaciones: migración, conversión, edición e idempotencia correctas.');
