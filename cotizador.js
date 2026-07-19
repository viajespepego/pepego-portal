const sessionKey = 'pepego_admin_session';
let token = sessionStorage.getItem(sessionKey) || '';
let savedQuotes = [];
let activeQuoteCreatedAt = new Date().toISOString();
let priceFinalManuallyEdited = false;

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
const displayCreationDate = value => {
  if (!value) return displayDate(new Date().toISOString().slice(0, 10));
  const raw = String(value);
  const iso = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return displayDate(iso);
  const local = raw.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (local) {
    const first = Number(local[1]), second = Number(local[2]);
    const day = first > 12 ? first : second > 12 ? second : first;
    const month = first > 12 ? second : second > 12 ? first : second;
    return displayDate(`${local[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return raw;
};
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

function calculatedFinalPrice() {
  const realPrice = number(form.elements.precioReal.value);
  const discount = Math.max(0, number(form.elements.descuentoAplicado.value));
  const discountAmount = form.elements.tipoDescuento.value === 'monto' ? discount : realPrice * discount / 100;
  return Math.max(0, realPrice - discountAmount);
}

function calculateInvestment(forceCalculatedFinal = false) {
  const calculated = calculatedFinalPrice();
  if (forceCalculatedFinal || !priceFinalManuallyEdited || form.elements.precioTotal.value === '') {
    form.elements.precioTotal.value = calculated.toFixed(2);
    priceFinalManuallyEdited = false;
  }
  const finalPrice = number(form.elements.precioTotal.value);
  form.elements.saldoPendiente.value = Math.max(0, finalPrice - number(form.elements.anticipo.value)).toFixed(2);
  const mismatch = Math.abs(finalPrice - calculated) > 0.009;
  document.getElementById('price-warning').hidden = !mismatch;
  document.getElementById('use-calculated-price').hidden = !mismatch;
}

function calculateBalance() {
  calculateInvestment(false);
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
  const calculatedPrice = calculatedFinalPrice();
  const finalPrice = number(base.precioTotal);
  return {
    ...base,
    fechaCreacion: activeQuoteCreatedAt,
    codigoBaseReserva: text(base.codigoBaseReserva).toUpperCase().replace(/\s+/g, ''),
    adultos: integer(base.adultos), menores: integer(base.menores), personas: integer(base.adultos) + integer(base.menores),
    edadesMenores: [...agesList.querySelectorAll('.minor-age')].map(input => input.value === '' ? '' : integer(input.value)),
    habitacionesJson: rooms, destinosJson: destinations,
    destino: firstDestination.ciudad || '', hotel: firstDestination.hotel || '', fechaSalida: firstDestination.fechaLlegada || '', fechaRegreso: destinations.at(-1)?.fechaSalida || '',
    tipoHabitacion: firstRoom.tipo || firstDestination.tipoHabitacion || '', planAlimentos: firstRoom.regimen || firstDestination.regimenAlimentos || '',
    precioReal: number(base.precioReal), tipoDescuento: base.tipoDescuento || 'porcentaje', descuentoAplicado: Math.max(0, number(base.descuentoAplicado)), precioFinalManual: Math.abs(finalPrice - calculatedPrice) > 0.009 ? finalPrice : '',
    precioTotal: finalPrice, anticipo: number(base.anticipo), saldoPendiente: Math.max(0, finalPrice - number(base.anticipo)),
    imagenes: images
  };
}

function renderProposalRow(label, value, options = {}) {
  const present = options.allowZero ? value !== '' && value !== null && value !== undefined : Boolean(text(value));
  if (!present) return '';
  return `<div class="proposal-data-row"><span class="proposal-data-label">${esc(label)}</span><strong class="proposal-data-value">${esc(value)}</strong></div>`;
}

function renderClientCard(data) {
  const rows = [renderProposalRow('Nombre', data.clienteNombre), renderProposalRow('Correo', data.clienteEmail), renderProposalRow('Teléfono', data.clienteTelefono)].join('');
  return rows ? `<article class="proposal-summary-card printable-card"><h2>Datos del cliente</h2><div class="proposal-data-list">${rows}</div></article>` : '';
}

function renderTravelersCard(data) {
  const ages = data.edadesMenores.filter(age => age !== '');
  if (!data.adultos && !data.menores && !ages.length) return '';
  const rows = [renderProposalRow('Adultos', data.adultos, { allowZero: true }), renderProposalRow('Menores', data.menores, { allowZero: true }), ages.length ? renderProposalRow('Edades', ages.join(', ')) : '', renderProposalRow('Total de pasajeros', data.personas, { allowZero: true })].join('');
  return `<article class="proposal-summary-card printable-card"><h2>Viajeros</h2><div class="proposal-data-list">${rows}</div></article>`;
}

function renderRoomsCard(rooms) {
  const usefulRooms = rooms.filter(room => room.tipo || room.regimen || room.adultos || room.menores || room.observaciones);
  if (!usefulRooms.length) return '';
  const cards = usefulRooms.map((room, index) => `<section class="proposal-room-card printable-card"><h3>Habitación ${esc(room.numero || index + 1)}</h3><div class="proposal-data-list">${renderProposalRow('Tipo de habitación', room.tipo)}${renderProposalRow('Régimen', room.regimen)}${renderProposalRow('Adultos', room.adultos, { allowZero: true })}${renderProposalRow('Menores', room.menores, { allowZero: true })}${renderProposalRow('Observaciones', room.observaciones)}</div></section>`).join('');
  return `<article class="proposal-summary-card proposal-rooms-card printable-card"><h2>Habitaciones</h2><div class="proposal-room-list">${cards}</div></article>`;
}

function renderProposalHeader(data) {
  const mainDestination = data.destinosJson.find(destination => destination.ciudad)?.ciudad || data.destino || 'Viaje por definir';
  return `<header class="proposal-header printable-card"><div class="proposal-header-logo"><img src="assets/logo.png" alt="Pepe GO! Tu Compa de Viajes"></div><div class="proposal-header-client"><span>Preparada para</span><h1>${esc(data.clienteNombre || 'Cliente por definir')}</h1><p>${esc(mainDestination)}</p></div><aside class="proposal-folio-card"><span>Cotización</span><strong>${esc(data.cotizacionId || 'Borrador')}</strong><small>Elaborada el ${esc(displayCreationDate(data.fechaCreacion))}</small>${data.folioViaje ? `<small>Reserva ${esc(data.folioViaje)}</small>` : ''}</aside></header>`;
}

function renderTransportCard(kind, details) {
  const isFlight = kind === 'flight';
  const rows = isFlight
    ? [renderProposalRow('Aerolínea', details.aerolinea), renderProposalRow('Número de vuelo', details.numeroVuelo), renderProposalRow('Origen', details.origen), renderProposalRow('Destino', details.destino), details.fecha ? renderProposalRow('Fecha', displayDate(details.fecha)) : '', renderProposalRow('Hora', details.hora), renderProposalRow('Equipaje', details.equipaje), renderProposalRow('Observaciones', details.observaciones)].join('')
    : [renderProposalRow('Tipo de traslado', details.tipo), renderProposalRow('Origen', details.origen), renderProposalRow('Destino', details.destino), details.fecha ? renderProposalRow('Fecha', displayDate(details.fecha)) : '', renderProposalRow('Hora', details.hora), renderProposalRow('Proveedor', details.proveedor), renderProposalRow('Observaciones', details.observaciones)].join('');
  if (!rows) return '';
  return `<article class="proposal-transport-card printable-card"><div class="proposal-transport-icon" aria-hidden="true">${isFlight ? '✈' : '↔'}</div><div><h4>${isFlight ? 'Vuelo' : 'Traslado'}</h4><div class="proposal-data-list proposal-transport-data">${rows}</div></div></article>`;
}

function renderDestinationCard(destination, index, servicesIncluded, image) {
  const hasDestination = destination.ciudad || destination.hotel || destination.fechaLlegada || destination.fechaSalida || destination.tipoHabitacion || destination.regimenAlimentos || destination.observaciones || ['vuelo','traslado','vuelo_traslado'].includes(destination.transporte);
  if (!hasDestination) return '';
  const features = [
    destination.fechaLlegada ? ['📅', 'Llegada', displayDate(destination.fechaLlegada)] : null,
    destination.fechaSalida ? ['📅', 'Salida', displayDate(destination.fechaSalida)] : null,
    destination.noches ? ['☾', 'Noches', destination.noches] : null,
    destination.tipoHabitacion ? ['▣', 'Habitación', destination.tipoHabitacion] : null,
    destination.regimenAlimentos ? ['◉', 'Régimen de alimentos', destination.regimenAlimentos] : null
  ].filter(Boolean).map(([icon, label, value]) => `<div class="proposal-feature"><span class="proposal-feature-icon" aria-hidden="true">${icon}</span><span><small>${esc(label)}</small><strong>${esc(value)}</strong></span></div>`).join('');
  const transport = `${['vuelo','vuelo_traslado'].includes(destination.transporte) ? renderTransportCard('flight', destination.vuelo || {}) : ''}${['traslado','vuelo_traslado'].includes(destination.transporte) ? renderTransportCard('transfer', destination.traslado || {}) : ''}`;
  const safeImage = image ? safeImageUrl(image.url) : '';
  return `<article class="proposal-destination-card printable-card"><div class="proposal-destination-label">Destino ${index + 1}</div><div class="proposal-destination-title"><div><h2>${esc(destination.ciudad || 'Destino por definir')}</h2>${destination.hotel ? `<p>${esc(destination.hotel)}</p>` : ''}</div></div>${safeImage ? `<figure class="proposal-destination-image"><img src="${esc(safeImage)}" alt="${esc(image.titulo || destination.ciudad || 'Destino')}" referrerpolicy="no-referrer">${image.titulo ? `<figcaption>${esc(image.titulo)}</figcaption>` : ''}</figure>` : ''}${features ? `<div class="proposal-feature-grid">${features}</div>` : ''}${servicesIncluded ? `<section class="proposal-services"><h3>Servicios incluidos</h3><p>${multiline(servicesIncluded)}</p></section>` : ''}${destination.observaciones ? `<section class="proposal-services"><h3>Notas del destino</h3><p>${multiline(destination.observaciones)}</p></section>` : ''}${transport ? `<div class="proposal-transport-list">${transport}</div>` : ''}</article>`;
}

function renderGallery(images) {
  const valid = images.map(image => ({ ...image, safeUrl: safeImageUrl(image.url) })).filter(image => image.safeUrl).slice(0, 4);
  if (!valid.length) return '';
  const imageFigure = (image, className = '') => `<figure class="${className} printable-card"><img src="${esc(image.safeUrl)}" alt="${esc(image.titulo || 'Imagen de la propuesta')}" referrerpolicy="no-referrer">${image.titulo ? `<figcaption>${esc(image.titulo)}</figcaption>` : ''}</figure>`;
  return `<section class="proposal-section proposal-gallery-section"><div class="proposal-section-heading"><span>Galería</span><h2>Una mirada a tu próximo viaje</h2></div><div class="proposal-gallery proposal-gallery-${valid.length}">${imageFigure(valid[0], 'proposal-gallery-main')}${valid.length > 1 ? `<div class="proposal-gallery-secondary">${valid.slice(1).map(image => imageFigure(image)).join('')}</div>` : ''}</div></section>`;
}

function renderInvestmentSummary(data) {
  const discountText = data.tipoDescuento === 'monto' ? money(data.descuentoAplicado) : `${number(data.descuentoAplicado)}%`;
  const items = [
    ['Precio real', money(data.precioReal), 'real', 'MXN'], ['Descuento aplicado', discountText, 'discount', data.tipoDescuento === 'monto' ? 'MXN' : 'PORCENTAJE'], ['Precio final', money(data.precioTotal), 'final', 'MXN'], ['Anticipo', money(data.anticipo), 'deposit', 'MXN'], ['Saldo pendiente', money(data.saldoPendiente), 'balance', 'MXN']
  ];
  return `<section class="proposal-section proposal-investment printable-card"><div class="proposal-section-heading"><span>Resumen de inversión</span><h2>Tu viaje, claramente desglosado</h2></div><div class="proposal-investment-grid">${items.map(([label, value, type, unit]) => `<article class="proposal-investment-item investment-${type}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(unit)}</small></article>`).join('')}</div></section>`;
}

function renderDeadlines(data) {
  const deadlines = [data.fechaLimiteReserva ? ['Fecha límite para reservar', displayDate(data.fechaLimiteReserva)] : null, data.fechaLiquidacion ? ['Fecha límite para liquidar', displayDate(data.fechaLiquidacion)] : null].filter(Boolean);
  if (!deadlines.length) return '';
  return `<section class="proposal-deadlines">${deadlines.map(([label, value]) => `<article class="proposal-deadline-card printable-card"><span class="proposal-calendar-icon" aria-hidden="true">📅</span><div><small>${esc(label)}</small><strong>${esc(value)}</strong></div></article>`).join('')}</section>`;
}

function renderObservations(value) {
  const items = String(value || '').split(/\r?\n/).map(item => item.replace(/^[-•‣]\s*/, '').trim()).filter(Boolean);
  if (!items.length) return '';
  return `<section class="proposal-section proposal-observations printable-card"><div class="proposal-section-heading"><span>Observaciones</span></div><ul>${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul></section>`;
}

function renderStandaloneServices(value) {
  if (!text(value)) return '';
  return `<section class="proposal-section proposal-observations printable-card"><div class="proposal-section-heading"><span>Servicios incluidos</span></div><p class="proposal-standalone-copy">${multiline(value)}</p></section>`;
}

function renderProposalFooter() {
  const contacts = window.PEPEGO_CONFIG?.CONTACT || {};
  const entries = [
    ['WhatsApp', contacts.WHATSAPP, contacts.WHATSAPP ? `https://wa.me/${String(contacts.WHATSAPP).replace(/\D/g, '')}` : ''],
    ['Instagram', contacts.INSTAGRAM, /^https?:/i.test(contacts.INSTAGRAM || '') ? contacts.INSTAGRAM : contacts.INSTAGRAM ? `https://instagram.com/${String(contacts.INSTAGRAM).replace(/^@/, '')}` : ''],
    ['Sitio web', contacts.WEBSITE, safeImageUrl(contacts.WEBSITE)],
    ['Correo', contacts.EMAIL, contacts.EMAIL ? `mailto:${contacts.EMAIL}` : '']
  ].filter(([, value]) => value);
  const contactHtml = entries.length ? `<nav class="proposal-contact-list">${entries.map(([label, value, href]) => `<a href="${esc(href)}" target="_blank" rel="noopener"><span>${esc(label)}</span><strong>${esc(value)}</strong></a>`).join('')}</nav>` : '';
  return `<footer class="proposal-footer printable-card"><div class="proposal-thanks"><strong>Gracias por permitirnos ser parte de tus planes.</strong><p>¡Estamos listos para hacer de tu viaje una experiencia inolvidable!</p></div>${contactHtml}<small class="proposal-legal">Precios sujetos a cambios sin previo aviso y disponibilidad al momento de reservar.</small></footer>`;
}

function renderPreview() {
  const data = collectData();
  const summaryCards = [renderClientCard(data), renderTravelersCard(data), renderRoomsCard(data.habitacionesJson)].filter(Boolean).join('');
  const usefulDestinations = data.destinosJson.filter(destination => destination.ciudad || destination.hotel || destination.fechaLlegada || destination.fechaSalida || destination.tipoHabitacion || destination.regimenAlimentos || destination.observaciones || destination.transporte !== 'ninguno');
  const destinationsHtml = usefulDestinations.length ? `<section class="proposal-section proposal-destinations"><div class="proposal-section-heading"><span>Destinos del viaje</span><h2>Tu itinerario, etapa por etapa</h2></div><div class="proposal-destination-list">${usefulDestinations.map((destination, index) => renderDestinationCard(destination, index, data.serviciosIncluidos, data.imagenes[index])).join('')}</div></section>` : '';
  preview.innerHTML = `<article class="quote-document proposal-document">${renderProposalHeader(data)}${summaryCards ? `<section class="proposal-summary-grid">${summaryCards}</section>` : ''}${destinationsHtml}${!usefulDestinations.length ? renderStandaloneServices(data.serviciosIncluidos) : ''}${renderGallery(data.imagenes)}${renderInvestmentSummary(data)}${renderDeadlines(data)}${renderObservations(data.observaciones)}${renderProposalFooter()}</article><div class="quote-preview-actions no-print"><button id="print-quote" type="button">Imprimir / Guardar como PDF</button><button id="whatsapp-quote" class="whatsapp-button" type="button">Compartir por WhatsApp</button></div>`;
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
    '', `Precio real: ${money(data.precioReal)}`, `Descuento: ${data.tipoDescuento === 'monto' ? money(data.descuentoAplicado) : `${data.descuentoAplicado}%`}`, `Precio final: ${money(data.precioTotal)}`, `Anticipo: ${money(data.anticipo)}`, `Saldo pendiente: ${money(data.saldoPendiente)}`,
    `Reservar antes del: ${displayDate(data.fechaLimiteReserva)}`, `Liquidar antes del: ${displayDate(data.fechaLiquidacion)}`,
    data.observaciones ? `Observaciones: ${data.observaciones}` : '', '', 'Pepe GO! — Tu Compa de Viajes'
  ].filter((item, index, array) => item !== '' || (array[index - 1] !== '' && array[index + 1] !== '')).join('\n');
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

function applySavedResult(result) {
  if (result.cotizacionId) form.elements.cotizacionId.value = result.cotizacionId;
  if (result.fechaCreacion) activeQuoteCreatedAt = result.fechaCreacion;
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
  activeQuoteCreatedAt = record.fechaCreacion || new Date().toISOString();
  ['cotizacionId','codigoBaseReserva','folioViaje','estatus','clienteNombre','clienteEmail','clienteTelefono','adultos','menores','personas','serviciosIncluidos','observaciones','precioReal','tipoDescuento','descuentoAplicado','precioTotal','anticipo','saldoPendiente','fechaLimiteReserva','fechaLiquidacion'].forEach(name => { if (form.elements[name]) form.elements[name].value = record[name] ?? ''; });
  if (!record.precioReal && record.precioTotal) form.elements.precioReal.value = record.precioTotal;
  form.elements.tipoDescuento.value = record.tipoDescuento || 'porcentaje';
  priceFinalManuallyEdited = record.precioFinalManual !== '' && record.precioFinalManual !== undefined && record.precioFinalManual !== null;
  if (priceFinalManuallyEdited) form.elements.precioTotal.value = record.precioFinalManual;
  const ages = parseJson(record.edadesMenores, String(record.edadesMenores || '').split(',').filter(Boolean));
  const rooms = parseJson(record.habitacionesJson, []);
  const destinations = parseJson(record.destinosJson, []);
  const legacyRoom = record.tipoHabitacion || record.planAlimentos ? [{ tipo: record.tipoHabitacion, regimen: record.planAlimentos, adultos: record.adultos, menores: record.menores }] : [];
  const legacyDestination = record.destino || record.hotel ? [{ ciudad: record.destino, hotel: record.hotel, fechaLlegada: record.fechaSalida, fechaSalida: record.fechaRegreso, tipoHabitacion: record.tipoHabitacion, regimenAlimentos: record.planAlimentos }] : [];
  (rooms.length ? rooms : legacyRoom).forEach(addRoom);
  (destinations.length ? destinations : legacyDestination).forEach(addDestination);
  imageRecords(record).forEach(addImage);
  renderMinorAges(integer(record.menores), ages);
  calculateInvestment(false);
  document.getElementById('editor-mode').textContent = record.convertidoEnViaje === 'true' || record.convertidoEnViaje === true || record.folioViaje ? 'Reserva editable' : 'Cotización guardada';
  document.getElementById('editor-title').textContent = record.cotizacionId || 'Cotización';
  document.getElementById('conversion-badge').hidden = !record.folioViaje;
  form.elements.codigoBaseReserva.readOnly = Boolean(record.folioViaje);
  showMessage(`Cotización ${record.cotizacionId} cargada.`, true);
  renderPreview();
}

function resetEditor(addDefaults = true) {
  form.reset();
  activeQuoteCreatedAt = new Date().toISOString();
  priceFinalManuallyEdited = false;
  roomsList.innerHTML = '';
  destinationsList.innerHTML = '';
  imagesList.innerHTML = '';
  agesList.innerHTML = '';
  form.elements.adultos.value = 0;
  form.elements.menores.value = 0;
  form.elements.personas.value = 0;
  form.elements.estatus.value = 'Borrador';
  form.elements.tipoDescuento.value = 'porcentaje';
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

form.elements.precioReal.addEventListener('input', () => calculateInvestment(false));
form.elements.tipoDescuento.addEventListener('change', () => calculateInvestment(false));
form.elements.descuentoAplicado.addEventListener('input', () => calculateInvestment(false));
form.elements.precioTotal.addEventListener('input', () => { priceFinalManuallyEdited = true; calculateInvestment(false); });
form.elements.anticipo.addEventListener('input', () => calculateInvestment(false));
document.getElementById('use-calculated-price').addEventListener('click', () => calculateInvestment(true));
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
