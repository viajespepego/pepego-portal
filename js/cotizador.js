const sessionKey = 'pepego_admin_session';
let token = sessionStorage.getItem(sessionKey) || '';
let savedQuotes = [];

const app = document.getElementById('quote-app');
const form = document.getElementById('quote-form');
const preview = document.getElementById('quote-preview');
const roomsList = document.getElementById('rooms-list');
const destinationsList = document.getElementById('destinations-list');
const imagesList = document.getElementById('images-list');
const agesList = document.getElementById('minor-ages');
const quotesSelect = document.getElementById('saved-quotes');

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const text = value => String(value ?? '').trim();
const number = value => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const integer = value => Math.max(0, Math.floor(number(value)));
const money = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(number(value));
const displayDate = value => value ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : 'Por definir';
const multiline = value => esc(value || 'Por definir').replace(/\r?\n/g, '<br>');
const parseJson = (value, fallback = []) => { try { const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value; return Array.isArray(parsed) ? parsed : fallback; } catch (_) { return fallback; } };
const fieldValue = (scope, name) => text(scope.querySelector(`[data-field="${name}"]`)?.value);
const safeImageUrl = value => { try { const url = new URL(text(value)); if (!/^https?:$/.test(url.protocol)) return ''; if (url.hostname === 'drive.google.com') { const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/); const id = fileMatch?.[1] || url.searchParams.get('id'); if (id) return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`; } return url.href; } catch (_) { return ''; } };

function showMessage(message, success = false) {
  const element = document.getElementById('quote-message');
  element.textContent = message;
  element.classList.toggle('success', success);
}

function setBusy(button, busy) {
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
}

function calculateBalance() {
  const total = number(form.elements.precioTotal.value);
  const deposit = number(form.elements.anticipo.value);
  form.elements.saldoPendiente.value = Math.max(0, total - deposit).toFixed(2);
}

function updatePassengerTotal() {
  const adults = integer(form.elements.adultos.value);
  const children = integer(form.elements.menores.value);
  form.elements.personas.value = adults + children;
  renderMinorAges(children);
}

function renderMinorAges(count, savedAges) {
  const current = savedAges || [...agesList.querySelectorAll('input')].map(input => input.value);
  agesList.innerHTML = Array.from({ length: count }, (_, index) => `<label>Edad del menor ${index + 1}<input class="minor-age" type="number" min="0" max="17" step="1" value="${esc(current[index] ?? '')}"></label>`).join('');
}

function renumberCards(container, label) {
  [...container.children].forEach((card, index) => {
    card.dataset.index = String(index + 1);
    const title = card.querySelector('.dynamic-card-title');
    if (title) title.textContent = `${label} ${index + 1}`;
    const numberInput = card.querySelector('[data-field="numero"]');
    if (numberInput) numberInput.value = index + 1;
  });
}

function addRoom(data = {}) {
  const card = document.createElement('article');
  card.className = 'dynamic-card room-card';
  card.innerHTML = `
    <div class="dynamic-card-head"><h3 class="dynamic-card-title">Habitación</h3><button class="remove-dynamic" data-remove="room" type="button">Eliminar</button></div>
    <div class="field-grid">
      <label>Número de habitación<input data-field="numero" type="number" readonly></label>
      <label>Tipo de habitación<input data-field="tipo" value="${esc(data.tipo)}"></label>
      <label>Hospedaje o régimen de alimentos<input data-field="regimen" value="${esc(data.regimen)}"></label>
      <label>Número de adultos<input data-field="adultos" type="number" min="0" step="1" value="${esc(data.adultos ?? '')}"></label>
      <label>Número de menores<input data-field="menores" type="number" min="0" step="1" value="${esc(data.menores ?? '')}"></label>
    </div>
    <label>Observaciones<textarea data-field="observaciones" rows="2">${esc(data.observaciones)}</textarea></label>`;
  roomsList.append(card);
  renumberCards(roomsList, 'Habitación');
}

function transportFields(kind, data = {}) {
  if (kind === 'flight') return `
    <section class="transport-fields flight-fields"><h4>Vuelo</h4><div class="field-grid">
      <label>Aerolínea<input data-field="vueloAerolinea" value="${esc(data.aerolinea)}"></label>
      <label>Número de vuelo<input data-field="vueloNumero" value="${esc(data.numeroVuelo)}"></label>
      <label>Origen<input data-field="vueloOrigen" value="${esc(data.origen)}"></label>
      <label>Destino<input data-field="vueloDestino" value="${esc(data.destino)}"></label>
      <label>Fecha<input data-field="vueloFecha" type="date" value="${esc(data.fecha)}"></label>
      <label>Hora<input data-field="vueloHora" type="time" value="${esc(data.hora)}"></label>
      <label>Equipaje<input data-field="vueloEquipaje" value="${esc(data.equipaje)}"></label>
    </div><label>Observaciones del vuelo<textarea data-field="vueloObservaciones" rows="2">${esc(data.observaciones)}</textarea></label></section>`;
  return `
    <section class="transport-fields transfer-fields"><h4>Traslado</h4><div class="field-grid">
      <label>Tipo de traslado<input data-field="trasladoTipo" value="${esc(data.tipo)}"></label>
      <label>Origen<input data-field="trasladoOrigen" value="${esc(data.origen)}"></label>
      <label>Destino<input data-field="trasladoDestino" value="${esc(data.destino)}"></label>
      <label>Fecha<input data-field="trasladoFecha" type="date" value="${esc(data.fecha)}"></label>
      <label>Hora<input data-field="trasladoHora" type="time" value="${esc(data.hora)}"></label>
      <label>Proveedor<input data-field="trasladoProveedor" value="${esc(data.proveedor)}"></label>
    </div><label>Observaciones del traslado<textarea data-field="trasladoObservaciones" rows="2">${esc(data.observaciones)}</textarea></label></section>`;
}

function updateTransportVisibility(card) {
  const transport = fieldValue(card, 'transporte') || 'ninguno';
  const flight = card.querySelector('.flight-fields');
  const transfer = card.querySelector('.transfer-fields');
  flight.hidden = !['vuelo', 'vuelo_traslado'].includes(transport);
  transfer.hidden = !['traslado', 'vuelo_traslado'].includes(transport);
}

function calculateDestinationNights(card) {
  const arrival = fieldValue(card, 'fechaLlegada');
  const departure = fieldValue(card, 'fechaSalida');
  const output = card.querySelector('[data-field="noches"]');
  if (!arrival || !departure) { output.value = ''; return; }
  output.value = Math.max(0, Math.round((new Date(`${departure}T12:00:00Z`) - new Date(`${arrival}T12:00:00Z`)) / 86400000));
}

function addDestination(data = {}) {
  const card = document.createElement('article');
  card.className = 'dynamic-card destination-card';
  const transport = data.transporte || 'ninguno';
  card.innerHTML = `
    <div class="dynamic-card-head"><h3 class="dynamic-card-title">Destino</h3><button class="remove-dynamic" data-remove="destination" type="button">Eliminar</button></div>
    <div class="field-grid">
      <label>Ciudad o destino<input data-field="ciudad" value="${esc(data.ciudad || data.destino)}"></label>
      <label>Hotel<input data-field="hotel" value="${esc(data.hotel)}"></label>
      <label>Fecha de llegada<input data-field="fechaLlegada" type="date" value="${esc(data.fechaLlegada)}"></label>
      <label>Fecha de salida<input data-field="fechaSalida" type="date" value="${esc(data.fechaSalida)}"></label>
      <label>Número de noches<input data-field="noches" type="number" min="0" step="1" value="${esc(data.noches ?? '')}"></label>
      <label>Tipo de habitación<input data-field="tipoHabitacion" value="${esc(data.tipoHabitacion)}"></label>
      <label>Régimen de alimentos<input data-field="regimenAlimentos" value="${esc(data.regimenAlimentos)}"></label>
      <label>Transporte<select data-field="transporte"><option value="ninguno">Sin transporte</option><option value="vuelo">Vuelo</option><option value="traslado">Traslado</option><option value="vuelo_traslado">Vuelo y traslado</option></select></label>
    </div>
    <label>Observaciones del destino<textarea data-field="observaciones" rows="2">${esc(data.observaciones)}</textarea></label>
    ${transportFields('flight', data.vuelo || {})}
    ${transportFields('transfer', data.traslado || {})}`;
  destinationsList.append(card);
  card.querySelector('[data-field="transporte"]').value = transport;
  updateTransportVisibility(card);
  if (!data.noches) calculateDestinationNights(card);
  renumberCards(destinationsList, 'Destino');
}

function updateImagePreview(card) {
  const url = safeImageUrl(fieldValue(card, 'url'));
  const image = card.querySelector('img');
  if (!url) { image.hidden = true; image.removeAttribute('src'); return; }
  image.src = url;
  image.hidden = false;
}

function addImage(data = {}) {
  if (imagesList.children.length >= 4) { showMessage('Puedes agregar un máximo de 4 imágenes.'); return; }
  const card = document.createElement('article');
  card.className = 'dynamic-card image-editor-card';
  card.innerHTML = `
    <div class="dynamic-card-head"><h3 class="dynamic-card-title">Imagen</h3><button class="remove-dynamic" data-remove="image" type="button">Eliminar</button></div>
    <img class="image-url-preview" alt="Vista previa" hidden>
    <label>URL pública de imagen<input data-field="url" type="url" value="${esc(data.url)}" placeholder="https://..."></label>
    <label>Título o descripción<input data-field="titulo" value="${esc(data.titulo)}"></label>`;
  imagesList.append(card);
  card.querySelector('img').addEventListener('error', event => { event.currentTarget.hidden = true; });
  renumberCards(imagesList, 'Imagen');
  updateImagePreview(card);
}

function collectRooms() {
  return [...roomsList.querySelectorAll('.room-card')].map((card, index) => ({ numero: index + 1, tipo: fieldValue(card, 'tipo'), regimen: fieldValue(card, 'regimen'), adultos: integer(fieldValue(card, 'adultos')), menores: integer(fieldValue(card, 'menores')), observaciones: fieldValue(card, 'observaciones') }));
}

function collectDestinations() {
  return [...destinationsList.querySelectorAll('.destination-card')].map(card => ({
    ciudad: fieldValue(card, 'ciudad'), hotel: fieldValue(card, 'hotel'), fechaLlegada: fieldValue(card, 'fechaLlegada'), fechaSalida: fieldValue(card, 'fechaSalida'), noches: integer(fieldValue(card, 'noches')), tipoHabitacion: fieldValue(card, 'tipoHabitacion'), regimenAlimentos: fieldValue(card, 'regimenAlimentos'), observaciones: fieldValue(card, 'observaciones'), transporte: fieldValue(card, 'transporte') || 'ninguno',
    vuelo: { aerolinea: fieldValue(card, 'vueloAerolinea'), numeroVuelo: fieldValue(card, 'vueloNumero'), origen: fieldValue(card, 'vueloOrigen'), destino: fieldValue(card, 'vueloDestino'), fecha: fieldValue(card, 'vueloFecha'), hora: fieldValue(card, 'vueloHora'), equipaje: fieldValue(card, 'vueloEquipaje'), observaciones: fieldValue(card, 'vueloObservaciones') },
    traslado: { tipo: fieldValue(card, 'trasladoTipo'), origen: fieldValue(card, 'trasladoOrigen'), destino: fieldValue(card, 'trasladoDestino'), fecha: fieldValue(card, 'trasladoFecha'), hora: fieldValue(card, 'trasladoHora'), proveedor: fieldValue(card, 'trasladoProveedor'), observaciones: fieldValue(card, 'trasladoObservaciones') }
  }));
}

function collectImages() {
  return [...imagesList.querySelectorAll('.image-editor-card')].map(card => ({ url: fieldValue(card, 'url'), titulo: fieldValue(card, 'titulo') })).filter(image => image.url || image.titulo).slice(0, 4);
}

function collectData() {
  calculateBalance();
  const base = Object.fromEntries(new FormData(form));
  const destinations = collectDestinations();
  const rooms = collectRooms();
  const images = collectImages();
  const firstDestination = destinations[0] || {};
  const firstRoom = rooms[0] || {};
  return {
    ...base,
    codigoBaseReserva: text(base.codigoBaseReserva).toUpperCase().replace(/\s+/g, ''),
    adultos: integer(base.adultos), menores: integer(base.menores), personas: integer(base.adultos) + integer(base.menores),
    edadesMenores: [...agesList.querySelectorAll('.minor-age')].map(input => input.value === '' ? '' : integer(input.value)),
    habitacionesJson: rooms, destinosJson: destinations,
    destino: firstDestination.ciudad || '', hotel: firstDestination.hotel || '', fechaSalida: firstDestination.fechaLlegada || '', fechaRegreso: destinations.at(-1)?.fechaSalida || '',
    tipoHabitacion: firstRoom.tipo || firstDestination.tipoHabitacion || '', planAlimentos: firstRoom.regimen || firstDestination.regimenAlimentos || '',
    precioTotal: number(base.precioTotal), anticipo: number(base.anticipo), saldoPendiente: Math.max(0, number(base.precioTotal) - number(base.anticipo)),
    imagenes: images
  };
}

function roomPreview(room) {
  return `<article class="preview-card printable-card"><h4>Habitación ${esc(room.numero)}</h4><div class="preview-data-grid"><span><small>Tipo</small>${esc(room.tipo || 'Por definir')}</span><span><small>Régimen</small>${esc(room.regimen || 'Por definir')}</span><span><small>Adultos</small>${esc(room.adultos)}</span><span><small>Menores</small>${esc(room.menores)}</span></div>${room.observaciones ? `<p>${multiline(room.observaciones)}</p>` : ''}</article>`;
}

function transportPreview(destination) {
  const blocks = [];
  if (['vuelo', 'vuelo_traslado'].includes(destination.transporte)) {
    const flight = destination.vuelo || {};
    blocks.push(`<div class="transport-preview printable-card"><strong>Vuelo</strong><p>${esc(flight.aerolinea || 'Aerolínea por definir')} ${flight.numeroVuelo ? `· ${esc(flight.numeroVuelo)}` : ''}</p><p>${esc(flight.origen || 'Origen por definir')} → ${esc(flight.destino || 'Destino por definir')}</p><p>${displayDate(flight.fecha)}${flight.hora ? ` · ${esc(flight.hora)}` : ''}${flight.equipaje ? ` · Equipaje: ${esc(flight.equipaje)}` : ''}</p>${flight.observaciones ? `<p>${multiline(flight.observaciones)}</p>` : ''}</div>`);
  }
  if (['traslado', 'vuelo_traslado'].includes(destination.transporte)) {
    const transfer = destination.traslado || {};
    blocks.push(`<div class="transport-preview printable-card"><strong>Traslado</strong><p>${esc(transfer.tipo || 'Tipo por definir')}${transfer.proveedor ? ` · ${esc(transfer.proveedor)}` : ''}</p><p>${esc(transfer.origen || 'Origen por definir')} → ${esc(transfer.destino || 'Destino por definir')}</p><p>${displayDate(transfer.fecha)}${transfer.hora ? ` · ${esc(transfer.hora)}` : ''}</p>${transfer.observaciones ? `<p>${multiline(transfer.observaciones)}</p>` : ''}</div>`);
  }
  return blocks.join('');
}

function destinationPreview(destination, index) {
  return `<article class="preview-destination printable-card"><div class="preview-card-number">Destino ${index + 1}</div><h3>${esc(destination.ciudad || 'Destino por definir')}</h3><p class="preview-hotel">${esc(destination.hotel || 'Hotel por definir')}</p><div class="preview-data-grid"><span><small>Llegada</small>${displayDate(destination.fechaLlegada)}</span><span><small>Salida</small>${displayDate(destination.fechaSalida)}</span><span><small>Noches</small>${esc(destination.noches)}</span><span><small>Habitación</small>${esc(destination.tipoHabitacion || 'Por definir')}</span><span><small>Alimentos</small>${esc(destination.regimenAlimentos || 'Por definir')}</span></div>${destination.observaciones ? `<p>${multiline(destination.observaciones)}</p>` : ''}${transportPreview(destination)}</article>`;
}

function galleryPreview(images) {
  const valid = images.map(image => ({ ...image, safeUrl: safeImageUrl(image.url) })).filter(image => image.safeUrl);
  if (!valid.length) return '';
  return `<section class="quote-gallery gallery-${valid.length}">${valid.map((image, index) => `<figure class="printable-card ${index === 0 ? 'gallery-main' : ''}"><img src="${esc(image.safeUrl)}" alt="${esc(image.titulo || `Imagen ${index + 1}`)}" referrerpolicy="no-referrer"><figcaption>${esc(image.titulo)}</figcaption></figure>`).join('')}</section>`;
}

function renderPreview() {
  const data = collectData();
  const destinations = data.destinosJson;
  const rooms = data.habitacionesJson;
  const ages = data.edadesMenores.filter(age => age !== '');
  preview.innerHTML = `
    <article class="quote-document">
      <header class="quote-document-head"><img src="assets/logo.png" alt="Pepe GO! Tu Compa de Viajes"><div><span>Cotización de viaje</span><strong>${esc(data.cotizacionId || 'Borrador sin guardar')}</strong>${data.folioViaje ? `<small>Reserva ${esc(data.folioViaje)}</small>` : ''}</div></header>
      ${galleryPreview(data.imagenes)}
      <div class="quote-highlight"><span>Preparada para</span><h2>${esc(data.clienteNombre || 'Cliente por definir')}</h2><p>${esc(destinations[0]?.ciudad || 'Viaje por definir')}</p></div>
      <section class="quote-client preview-section printable-card"><h3>Datos del cliente</h3><div class="preview-data-grid"><span><small>Nombre</small>${esc(data.clienteNombre || 'Por definir')}</span><span><small>Correo</small>${esc(data.clienteEmail || 'Por definir')}</span><span><small>Teléfono</small>${esc(data.clienteTelefono || 'Por definir')}</span></div></section>
      <section class="preview-section printable-card"><h3>Viajeros</h3><div class="preview-data-grid"><span><small>Adultos</small>${esc(data.adultos)}</span><span><small>Menores</small>${esc(data.menores)}</span><span><small>Total</small>${esc(data.personas)}</span>${ages.length ? `<span><small>Edades</small>${esc(ages.join(', '))}</span>` : ''}</div></section>
      ${rooms.length ? `<section class="preview-section"><h3>Habitaciones</h3><div class="preview-card-list">${rooms.map(roomPreview).join('')}</div></section>` : ''}
      ${destinations.length ? `<section class="preview-section"><h3>Destinos del viaje</h3><div class="preview-destination-list">${destinations.map(destinationPreview).join('')}</div></section>` : ''}
      <section class="quote-copy preview-section printable-card"><h3>Servicios incluidos</h3><p>${multiline(data.serviciosIncluidos)}</p></section>
      <section class="quote-prices printable-card"><div><span>Precio total</span><strong>${money(data.precioTotal)}</strong></div><div><span>Anticipo</span><strong>${money(data.anticipo)}</strong></div><div class="quote-balance"><span>Saldo pendiente</span><strong>${money(data.saldoPendiente)}</strong></div></section>
      <section class="quote-deadlines printable-card"><div><span>Fecha límite para reservar</span><strong>${displayDate(data.fechaLimiteReserva)}</strong></div><div><span>Fecha límite para liquidar</span><strong>${displayDate(data.fechaLiquidacion)}</strong></div></section>
      <section class="quote-copy preview-section printable-card"><h3>Observaciones</h3><p>${multiline(data.observaciones)}</p></section>
      <footer class="quote-document-footer"><strong>Pepe GO!</strong><span>Tu Compa de Viajes</span></footer>
    </article>
    <div class="quote-preview-actions no-print"><button id="print-quote" type="button">Imprimir / Guardar como PDF</button><button id="whatsapp-quote" class="whatsapp-button" type="button">Compartir por WhatsApp</button></div>`;
  document.getElementById('print-quote').onclick = () => window.print();
  document.getElementById('whatsapp-quote').onclick = () => shareWhatsApp(data);
  preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showMessage('Vista previa actualizada.', true);
}

function shareWhatsApp(data) {
  const destinations = data.destinosJson.map(item => item.ciudad || item.hotel).filter(Boolean).join(' · ') || 'Por definir';
  const message = [
    '🌎 *Cotización Pepe GO!*',
    data.cotizacionId ? `Cotización: ${data.cotizacionId}` : '', data.folioViaje ? `Reserva: ${data.folioViaje}` : '',
    `Cliente: ${data.clienteNombre || 'Por definir'}`, `Destinos: ${destinations}`, `Adultos: ${data.adultos}`, `Menores: ${data.menores}`,
    '', `Precio total: ${money(data.precioTotal)}`, `Anticipo: ${money(data.anticipo)}`, `Saldo pendiente: ${money(data.saldoPendiente)}`,
    `Reservar antes del: ${displayDate(data.fechaLimiteReserva)}`, `Liquidar antes del: ${displayDate(data.fechaLiquidacion)}`,
    data.observaciones ? `Observaciones: ${data.observaciones}` : '', '', 'Pepe GO! — Tu Compa de Viajes'
  ].filter((item, index, array) => item !== '' || (array[index - 1] !== '' && array[index + 1] !== '')).join('\n');
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

function applySavedResult(result) {
  if (result.cotizacionId) form.elements.cotizacionId.value = result.cotizacionId;
  if (result.estatus) form.elements.estatus.value = result.estatus;
  if (result.folioViaje) form.elements.folioViaje.value = result.folioViaje;
  form.elements.codigoBaseReserva.readOnly = Boolean(result.folioViaje);
  document.getElementById('conversion-badge').hidden = !result.folioViaje;
  document.getElementById('editor-mode').textContent = result.folioViaje ? 'Reserva editable' : 'Cotización guardada';
}

async function saveCurrentQuote(forceAccept = false) {
  const button = forceAccept ? document.getElementById('accept-button') : document.getElementById('save-button');
  const data = collectData();
  if (forceAccept) data.estatus = 'Aceptada';
  if (data.estatus === 'Aceptada' && !data.codigoBaseReserva) {
    showMessage('Escribe el código base de reserva antes de aceptar.');
    form.elements.codigoBaseReserva.focus();
    return;
  }
  setBusy(button, true);
  try {
    const result = forceAccept ? await PepeGoApi.acceptQuote(data, token) : await PepeGoApi.saveQuote(data, token);
    applySavedResult(result);
    renderPreview();
    showMessage(result.folioViaje ? `Reserva creada correctamente con el folio ${result.folioViaje}.` : `Cotización ${result.cotizacionId} guardada como ${result.estatus}.`, true);
    await loadQuotes(result.cotizacionId);
  } catch (error) {
    showMessage(error.message);
    if (/sesión/i.test(error.message)) { sessionStorage.removeItem(sessionKey); setTimeout(() => location.replace('admin.html'), 900); }
  } finally { setBusy(button, false); }
}

function imageRecords(record) {
  return [1, 2, 3, 4].map(index => ({ url: record[`imagen${index}Url`] || '', titulo: record[`imagen${index}Titulo`] || '' })).filter(image => image.url || image.titulo);
}

function loadRecord(record) {
  resetEditor(false);
  ['cotizacionId','codigoBaseReserva','folioViaje','estatus','clienteNombre','clienteEmail','clienteTelefono','adultos','menores','personas','serviciosIncluidos','observaciones','precioTotal','anticipo','saldoPendiente','fechaLimiteReserva','fechaLiquidacion'].forEach(name => { if (form.elements[name]) form.elements[name].value = record[name] ?? ''; });
  const ages = parseJson(record.edadesMenores, String(record.edadesMenores || '').split(',').filter(Boolean));
  const rooms = parseJson(record.habitacionesJson, []);
  const destinations = parseJson(record.destinosJson, []);
  const legacyRoom = record.tipoHabitacion || record.planAlimentos ? [{ tipo: record.tipoHabitacion, regimen: record.planAlimentos, adultos: record.adultos, menores: record.menores }] : [];
  const legacyDestination = record.destino || record.hotel ? [{ ciudad: record.destino, hotel: record.hotel, fechaLlegada: record.fechaSalida, fechaSalida: record.fechaRegreso, tipoHabitacion: record.tipoHabitacion, regimenAlimentos: record.planAlimentos }] : [];
  (rooms.length ? rooms : legacyRoom).forEach(addRoom);
  (destinations.length ? destinations : legacyDestination).forEach(addDestination);
  imageRecords(record).forEach(addImage);
  renderMinorAges(integer(record.menores), ages);
  calculateBalance();
  document.getElementById('editor-mode').textContent = record.convertidoEnViaje === 'true' || record.convertidoEnViaje === true || record.folioViaje ? 'Reserva editable' : 'Cotización guardada';
  document.getElementById('editor-title').textContent = record.cotizacionId || 'Cotización';
  document.getElementById('conversion-badge').hidden = !record.folioViaje;
  form.elements.codigoBaseReserva.readOnly = Boolean(record.folioViaje);
  showMessage(`Cotización ${record.cotizacionId} cargada.`, true);
  renderPreview();
}

function resetEditor(addDefaults = true) {
  form.reset();
  roomsList.innerHTML = '';
  destinationsList.innerHTML = '';
  imagesList.innerHTML = '';
  agesList.innerHTML = '';
  form.elements.adultos.value = 0;
  form.elements.menores.value = 0;
  form.elements.personas.value = 0;
  form.elements.estatus.value = 'Borrador';
  form.elements.codigoBaseReserva.readOnly = false;
  if (addDefaults) { addRoom(); addDestination(); }
  calculateBalance();
  document.getElementById('editor-mode').textContent = 'Nueva';
  document.getElementById('editor-title').textContent = 'Cotización';
  document.getElementById('conversion-badge').hidden = true;
  quotesSelect.value = '';
  preview.innerHTML = '<div class="quote-placeholder no-print"><strong>Tu cotización aparecerá aquí</strong><span>Puedes generar una vista previa aunque haya campos vacíos.</span></div>';
  showMessage('');
}

async function loadQuotes(selectedId = '') {
  savedQuotes = await PepeGoApi.quotes(token);
  quotesSelect.innerHTML = '<option value="">Selecciona una cotización</option>' + savedQuotes.map(record => {
    const destination = parseJson(record.destinosJson, [])[0]?.ciudad || record.destino || 'Sin destino';
    return `<option value="${esc(record.cotizacionId)}">${esc(record.cotizacionId)} · ${esc(record.clienteNombre || 'Sin cliente')} · ${esc(destination)} · ${esc(record.estatus || 'Borrador')}</option>`;
  }).join('');
  if (selectedId) quotesSelect.value = selectedId;
}

async function protectPage() {
  if (!token) { location.replace('admin.html'); return; }
  try { await loadQuotes(); app.hidden = false; resetEditor(); }
  catch (_) { sessionStorage.removeItem(sessionKey); location.replace('admin.html'); }
}

form.elements.precioTotal.addEventListener('input', calculateBalance);
form.elements.anticipo.addEventListener('input', calculateBalance);
form.elements.adultos.addEventListener('input', updatePassengerTotal);
form.elements.menores.addEventListener('input', updatePassengerTotal);
document.getElementById('add-room').addEventListener('click', () => addRoom());
document.getElementById('add-destination').addEventListener('click', () => addDestination());
document.getElementById('add-image').addEventListener('click', () => addImage());
document.getElementById('preview-button').addEventListener('click', renderPreview);
document.getElementById('accept-button').addEventListener('click', () => saveCurrentQuote(true));
document.getElementById('new-quote').addEventListener('click', () => resetEditor());
document.getElementById('load-quote').addEventListener('click', () => { const record = savedQuotes.find(item => item.cotizacionId === quotesSelect.value); if (record) loadRecord(record); else showMessage('Selecciona una cotización guardada.'); });
document.getElementById('logout').addEventListener('click', () => { sessionStorage.removeItem(sessionKey); location.replace('admin.html'); });

roomsList.addEventListener('click', event => { if (event.target.dataset.remove === 'room') { event.target.closest('.room-card').remove(); renumberCards(roomsList, 'Habitación'); } });
destinationsList.addEventListener('click', event => { if (event.target.dataset.remove === 'destination') { event.target.closest('.destination-card').remove(); renumberCards(destinationsList, 'Destino'); } });
destinationsList.addEventListener('change', event => { const card = event.target.closest('.destination-card'); if (!card) return; if (event.target.dataset.field === 'transporte') updateTransportVisibility(card); if (['fechaLlegada','fechaSalida'].includes(event.target.dataset.field)) calculateDestinationNights(card); });
imagesList.addEventListener('click', event => { if (event.target.dataset.remove === 'image') { event.target.closest('.image-editor-card').remove(); renumberCards(imagesList, 'Imagen'); } });
imagesList.addEventListener('input', event => { if (event.target.dataset.field === 'url') updateImagePreview(event.target.closest('.image-editor-card')); });
form.addEventListener('submit', event => { event.preventDefault(); saveCurrentQuote(false); });

protectPage();
