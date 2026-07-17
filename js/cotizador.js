const sessionKey = 'pepego_admin_session';
let token = sessionStorage.getItem(sessionKey) || '';
const app = document.getElementById('quote-app');
const form = document.getElementById('quote-form');
const preview = document.getElementById('quote-preview');

const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const money = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value || 0));
const displayDate = value => value ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : '—';
const showMessage = (text, success = false) => { const element = document.getElementById('quote-message'); element.textContent = text; element.classList.toggle('success', success); };
const values = () => Object.fromEntries(new FormData(form));

function calculateBalance() {
  const total = Number(form.elements.precioTotal.value || 0);
  const deposit = Number(form.elements.anticipo.value || 0);
  form.elements.saldoPendiente.value = Math.max(0, total - deposit).toFixed(2);
}

function validateQuote(data) {
  if (!form.reportValidity()) return false;
  if (Number(data.anticipo) > Number(data.precioTotal)) { showMessage('El anticipo no puede ser mayor que el precio total.'); form.elements.anticipo.focus(); return false; }
  if (data.fechaRegreso < data.fechaSalida) { showMessage('La fecha de regreso no puede ser anterior a la fecha de salida.'); form.elements.fechaRegreso.focus(); return false; }
  return true;
}

function renderPreview() {
  calculateBalance();
  const data = values();
  if (!validateQuote(data)) return;
  const services = escapeHtml(data.serviciosIncluidos).replace(/\r?\n/g, '<br>');
  const observations = escapeHtml(data.observaciones || 'Sin observaciones adicionales.').replace(/\r?\n/g, '<br>');
  preview.innerHTML = `
    <article class="quote-document">
      <header class="quote-document-head"><img src="assets/logo.png" alt="Pepe GO! Tu Compa de Viajes"><div><span>Cotización de viaje</span><strong>Preparada para ${escapeHtml(data.clienteNombre)}</strong></div></header>
      <div class="quote-highlight"><span>Tu próxima aventura</span><h2>${escapeHtml(data.destino)}</h2><p>${escapeHtml(data.hotel)}</p></div>
      <div class="quote-detail-grid">
        <div><span>Fechas</span><strong>${displayDate(data.fechaSalida)} al ${displayDate(data.fechaRegreso)}</strong></div>
        <div><span>Viajeros</span><strong>${escapeHtml(data.personas)} persona${Number(data.personas) === 1 ? '' : 's'}</strong></div>
        <div><span>Habitación</span><strong>${escapeHtml(data.tipoHabitacion)}</strong></div>
        <div><span>Plan de alimentos</span><strong>${escapeHtml(data.planAlimentos)}</strong></div>
      </div>
      <section class="quote-copy"><h3>Servicios incluidos</h3><p>${services}</p></section>
      <section class="quote-prices"><div><span>Precio total</span><strong>${money(data.precioTotal)}</strong></div><div><span>Anticipo</span><strong>${money(data.anticipo)}</strong></div><div class="quote-balance"><span>Saldo pendiente</span><strong>${money(data.saldoPendiente)}</strong></div></section>
      <section class="quote-deadlines"><div><span>Fecha límite para reservar</span><strong>${displayDate(data.fechaLimiteReserva)}</strong></div><div><span>Fecha límite para liquidar</span><strong>${displayDate(data.fechaLiquidacion)}</strong></div></section>
      <section class="quote-copy"><h3>Observaciones</h3><p>${observations}</p></section>
      <footer class="quote-document-footer"><strong>Pepe GO!</strong><span>Tu Compa de Viajes</span></footer>
    </article>
    <div class="quote-preview-actions no-print"><button id="print-quote" type="button">Imprimir / Guardar como PDF</button><button id="whatsapp-quote" class="whatsapp-button" type="button">Compartir por WhatsApp</button></div>`;
  document.getElementById('print-quote').onclick = () => window.print();
  document.getElementById('whatsapp-quote').onclick = () => shareWhatsApp(data);
  preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showMessage('Vista previa actualizada.', true);
}

function shareWhatsApp(data) {
  const message = ['🌎 *Cotización Pepe GO!*', `Cliente: ${data.clienteNombre}`, `Destino: ${data.destino}`, `Hotel: ${data.hotel}`, `Fechas: ${displayDate(data.fechaSalida)} al ${displayDate(data.fechaRegreso)}`, `Personas: ${data.personas}`, `Habitación: ${data.tipoHabitacion}`, `Plan de alimentos: ${data.planAlimentos}`, `Servicios incluidos: ${data.serviciosIncluidos}`, '', `Precio total: ${money(data.precioTotal)}`, `Anticipo: ${money(data.anticipo)}`, `Saldo pendiente: ${money(data.saldoPendiente)}`, `Reservar antes del: ${displayDate(data.fechaLimiteReserva)}`, `Liquidar antes del: ${displayDate(data.fechaLiquidacion)}`, data.observaciones ? `Observaciones: ${data.observaciones}` : '', '', 'Pepe GO! — Tu Compa de Viajes'].filter(Boolean).join('\n');
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

async function protectPage() {
  if (!token) { location.replace('admin.html'); return; }
  try { await PepeGoApi.quotes(token); app.hidden = false; }
  catch (_) { sessionStorage.removeItem(sessionKey); location.replace('admin.html'); }
}

form.elements.precioTotal.addEventListener('input', calculateBalance);
form.elements.anticipo.addEventListener('input', calculateBalance);
document.getElementById('preview-button').addEventListener('click', renderPreview);
document.getElementById('logout').addEventListener('click', () => { sessionStorage.removeItem(sessionKey); location.replace('admin.html'); });
form.addEventListener('submit', async event => {
  event.preventDefault(); calculateBalance(); const data = values(); if (!validateQuote(data)) return;
  const button = document.getElementById('save-button'); button.disabled = true;
  try { const result = await PepeGoApi.saveQuote(data, token); renderPreview(); showMessage(`Cotización ${result.cotizacionId} guardada como Borrador.`, true); }
  catch (error) { showMessage(error.message); if (/sesión/i.test(error.message)) { sessionStorage.removeItem(sessionKey); setTimeout(() => location.replace('admin.html'), 900); } }
  finally { button.disabled = false; }
});

calculateBalance();
protectPage();
