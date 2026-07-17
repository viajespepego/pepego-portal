window.TripCard = (() => {
  const money = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value || 0));
  const date = value => value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : '—';
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
  const imageUrl = value => { try { const url = new URL(String(value || '')); if (!/^https?:$/.test(url.protocol)) return ''; if (url.hostname === 'drive.google.com') { const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/); const id = fileMatch?.[1] || url.searchParams.get('id'); if (id) return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`; } return url.href; } catch (_) { return ''; } };

  function transport(destination) {
    const items = [];
    if (['vuelo','vuelo_traslado'].includes(destination.transporte)) {
      const flight = destination.vuelo || {};
      items.push(`<div class="traveler-transport"><strong>Vuelo</strong><span>${esc(flight.aerolinea || '')} ${esc(flight.numeroVuelo || '')}</span><span>${esc(flight.origen || '')}${flight.origen || flight.destino ? ' → ' : ''}${esc(flight.destino || '')}</span><span>${date(flight.fecha)} ${esc(flight.hora || '')}</span></div>`);
    }
    if (['traslado','vuelo_traslado'].includes(destination.transporte)) {
      const transfer = destination.traslado || {};
      items.push(`<div class="traveler-transport"><strong>Traslado</strong><span>${esc(transfer.tipo || '')} ${esc(transfer.proveedor || '')}</span><span>${esc(transfer.origen || '')}${transfer.origen || transfer.destino ? ' → ' : ''}${esc(transfer.destino || '')}</span><span>${date(transfer.fecha)} ${esc(transfer.hora || '')}</span></div>`);
    }
    return items.join('');
  }

  function extras(t) {
    const destinations = Array.isArray(t.destinos) ? t.destinos : [];
    const rooms = Array.isArray(t.habitaciones) ? t.habitaciones : [];
    const images = (Array.isArray(t.imagenes) ? t.imagenes : []).map(image => ({ ...image, safe: imageUrl(image.url) })).filter(image => image.safe);
    if (!destinations.length && !rooms.length && !images.length && !t.serviciosIncluidos && !t.observaciones) return '';
    return `<section class="traveler-extra">
      ${images.length ? `<div class="traveler-gallery">${images.map(image => `<figure><img src="${esc(image.safe)}" alt="${esc(image.titulo || 'Imagen del viaje')}" referrerpolicy="no-referrer"><figcaption>${esc(image.titulo || '')}</figcaption></figure>`).join('')}</div>` : ''}
      ${destinations.length ? `<h3>Destinos del viaje</h3><div class="traveler-destinations">${destinations.map((destination,index) => `<article><small>Destino ${index+1}</small><strong>${esc(destination.ciudad || destination.destino || 'Por definir')}</strong><span>${esc(destination.hotel || '')}</span><span>${date(destination.fechaLlegada)} — ${date(destination.fechaSalida)} · ${esc(destination.noches || 0)} noches</span>${transport(destination)}</article>`).join('')}</div>` : ''}
      ${rooms.length ? `<h3>Habitaciones</h3><div class="traveler-rooms">${rooms.map((room,index) => `<article><strong>Habitación ${esc(room.numero || index+1)}</strong><span>${esc(room.tipo || 'Por definir')} · ${esc(room.regimen || 'Régimen por definir')}</span><span>${esc(room.adultos || 0)} adultos · ${esc(room.menores || 0)} menores</span></article>`).join('')}</div>` : ''}
      ${t.serviciosIncluidos ? `<div class="traveler-notes"><strong>Servicios incluidos</strong><p>${esc(t.serviciosIncluidos)}</p></div>` : ''}
      ${t.observaciones ? `<div class="traveler-notes"><strong>Observaciones</strong><p>${esc(t.observaciones)}</p></div>` : ''}
    </section>`;
  }

  function render(t) {
    const statusClass = /pendiente/i.test(t.estatus) ? 'pending' : /cancelado/i.test(t.estatus) ? 'cancelled' : '';
    const whatsapp = t.telefono ? `https://wa.me/${String(t.telefono).replace(/\D/g,'')}?text=${encodeURIComponent(`Hola Pepe GO!, tengo una consulta sobre mi viaje ${t.folio}.`)}` : '';
    const passengerText = t.adultos || t.menores ? `${t.adultos || 0} adultos · ${t.menores || 0} menores` : t.pasajeros;
    return `<article class="trip-card"><div class="trip-head"><div><p>Tu próximo viaje</p><h2>${esc(t.destino)}</h2><p>${esc(t.nombre)} · Folio ${esc(t.folio)}</p></div><span class="status ${statusClass}">${esc(t.estatus)}</span></div><div class="trip-content"><div class="detail-grid"><div><span class="detail-label">Hotel</span><span class="detail-value">${esc(t.hotel)}</span></div><div><span class="detail-label">Pasajeros</span><span class="detail-value">${esc(passengerText)}</span></div><div><span class="detail-label">Salida</span><span class="detail-value">${date(t.fechaSalida)}</span></div><div><span class="detail-label">Regreso</span><span class="detail-value">${date(t.fechaRegreso)}</span></div><div><span class="detail-label">Costo total</span><span class="detail-value">${money(t.costoTotal)}</span></div></div><div class="payment-area"><div class="amounts"><div><strong>${money(t.totalPagado)}</strong><small>Total pagado</small></div><div><strong>${money(t.saldoPendiente)}</strong><small>Saldo pendiente</small></div></div><div><div class="progress-label"><span>Progreso de pago</span><span>${t.porcentajePagado}%</span></div><div class="progress-track"><div class="progress-bar" style="width:${Math.min(100, Math.max(0, Number(t.porcentajePagado)))}%"></div></div>${t.proximoPagoMonto > 0 ? `<p class="next-payment">Próximo pago: <strong>${date(t.proximoPagoFecha)} · ${money(t.proximoPagoMonto)}</strong></p>` : ''}</div></div>${extras(t)}<div class="trip-actions"><a class="action-button ${t.itinerarioUrl ? '' : 'disabled'}" href="${esc(t.itinerarioUrl || '#')}" target="_blank" rel="noopener">↓ Descargar itinerario</a><a class="action-button ${t.vouchersUrl ? '' : 'disabled'}" href="${esc(t.vouchersUrl || '#')}" target="_blank" rel="noopener">↓ Descargar vouchers</a><a class="action-button whatsapp ${whatsapp ? '' : 'disabled'}" href="${whatsapp || '#'}" target="_blank" rel="noopener">WhatsApp de ayuda</a></div></div></article>`;
  }

  return { render };
})();
