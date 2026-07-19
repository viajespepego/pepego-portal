window.PepeGoApi = (() => {
  const url = () => window.PEPEGO_CONFIG?.API_URL;
  async function request(action, data = {}, token = '') {
    if (!url() || url().includes('PEGA_AQUI')) throw new Error('Configura la URL de Apps Script en frontend/config.js.');
    const response = await fetch(url(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, data, token }) });
    if (!response.ok) throw new Error('No fue posible conectar con el servicio de Pepe GO.');
    let result;
    try { result = await response.json(); } catch (_) { throw new Error('El servicio devolvió una respuesta inválida.'); }
    if (!result.ok) throw new Error(result.error || 'No fue posible completar la operación.');
    return result.data;
  }
  return {
    search: query => request('search', { query }),
    login: password => request('login', { password }),
    dashboard: token => request('dashboard', {}, token),
    saveTrip: (data, token) => request('saveTrip', data, token),
    registerPayment: (data, token) => request('registerPayment', data, token),
    saveQuote: (data, token) => request('saveQuote', data, token),
    acceptQuote: (data, token) => request('acceptQuote', data, token),
    quotes: token => request('quotes', {}, token)
  };
})();
