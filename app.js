// ── STORAGE ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'mediatracker_v1';

function loadData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { items: [] };
  } catch { return { items: [] }; }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function addItem(item) {
  const data = loadData();
  item.id = Date.now().toString();
  item.createdAt = new Date().toISOString();
  data.items.push(item);
  saveData(data);
  return item;
}

function updateItem(id, updates) {
  const data = loadData();
  const idx = data.items.findIndex(i => i.id === id);
  if (idx !== -1) { data.items[idx] = { ...data.items[idx], ...updates }; saveData(data); }
}

function deleteItem(id) {
  const data = loadData();
  data.items = data.items.filter(i => i.id !== id);
  saveData(data);
}

function getItemsByType(type) {
  return loadData().items.filter(i => i.type === type);
}

// ── API CONFIG ────────────────────────────────────────────────────────────────
// Replace with your actual API keys:
const API_KEYS = {
  tmdb: 'TU_TMDB_API_KEY_AQUI',
  googleBooks: 'TU_GOOGLE_BOOKS_API_KEY_AQUI',
  rawg: 'TU_RAWG_API_KEY_AQUI',
};

// ── API SEARCH ────────────────────────────────────────────────────────────────
async function searchTMDB(query, mediaType = 'movie') {
  // mediaType: 'movie' | 'tv'
  const url = `https://api.themoviedb.org/3/search/${mediaType}?api_key=${API_KEYS.tmdb}&query=${encodeURIComponent(query)}&language=es-ES`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.results || []).slice(0, 6).map(r => ({
    apiId: r.id,
    title: r.title || r.name,
    year: (r.release_date || r.first_air_date || '').slice(0, 4),
    poster: r.poster_path ? `https://image.tmdb.org/t/p/w185${r.poster_path}` : null,
    overview: r.overview,
  }));
}

async function searchAnime(query) {
  const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=6`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.data || []).slice(0, 6).map(r => ({
    apiId: r.mal_id,
    title: r.title,
    year: r.year || '',
    poster: r.images?.jpg?.image_url || null,
    overview: r.synopsis,
  }));
}

async function searchBooks(query) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=6&key=${API_KEYS.googleBooks}`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.items || []).slice(0, 6).map(r => ({
    apiId: r.id,
    title: r.volumeInfo.title,
    year: (r.volumeInfo.publishedDate || '').slice(0, 4),
    poster: r.volumeInfo.imageLinks?.thumbnail || null,
    overview: r.volumeInfo.description,
    author: (r.volumeInfo.authors || []).join(', '),
    pages: r.volumeInfo.pageCount,
  }));
}

async function searchGames(query) {
  const url = `https://api.rawg.io/api/games?key=${API_KEYS.rawg}&search=${encodeURIComponent(query)}&page_size=6`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.results || []).slice(0, 6).map(r => ({
    apiId: r.id,
    title: r.name,
    year: (r.released || '').slice(0, 4),
    poster: r.background_image || null,
    overview: '',
  }));
}

async function searchByType(type, query) {
  if (type === 'pelicula') return searchTMDB(query, 'movie');
  if (type === 'serie') return searchTMDB(query, 'tv');
  if (type === 'anime') return searchAnime(query);
  if (type === 'libro') return searchBooks(query);
  if (type === 'videojuego') return searchGames(query);
  return [];
}

// ── UI HELPERS ────────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2500);
}

function typeLabel(type) {
  return { pelicula: 'Película', serie: 'Serie', anime: 'Anime', videojuego: 'Videojuego', libro: 'Libro' }[type] || type;
}

function typeEmoji(type) {
  return { pelicula: '🎬', serie: '📺', anime: '🎌', videojuego: '🎮', libro: '📚' }[type] || '📁';
}

function statusLabel(status) {
  return { pending: 'Pendiente', progress: 'En progreso', completed: 'Completado', abandoned: 'Abandonado' }[status] || status;
}

function scoreDisplay(score) {
  if (!score) return '';
  return `★ ${score}/10`;
}

function posterEl(poster, type, className = '') {
  if (poster) return `<img src="${poster}" alt="poster" onerror="this.parentElement.innerHTML='<div class=\\"${className || 'card-poster-placeholder'}\\">${typeEmoji(type)}</div>'">`;
  return `<div class="${className || 'card-poster-placeholder'}">${typeEmoji(type)}</div>`;
}

// ── SIDEBAR COUNTS ────────────────────────────────────────────────────────────
function updateSidebarCounts() {
  const data = loadData();
  const counts = { pelicula: 0, serie: 0, anime: 0, videojuego: 0, libro: 0 };
  data.items.forEach(i => { if (counts[i.type] !== undefined) counts[i.type]++; });
  Object.entries(counts).forEach(([type, count]) => {
    const el = document.getElementById(`count-${type}`);
    if (el) el.textContent = count;
  });
}

// ── MODAL LOGIC ───────────────────────────────────────────────────────────────
let _modalResolve = null;

function openModal(type) {
  const overlay = document.getElementById('add-modal');
  if (!overlay) return;
  overlay.classList.add('open');
  overlay.dataset.type = type;
  document.getElementById('modal-title').textContent = `Añadir ${typeLabel(type)}`;
  resetModal();
}

function closeModal() {
  const overlay = document.getElementById('add-modal');
  if (overlay) overlay.classList.remove('open');
  resetModal();
}

function resetModal() {
  const overlay = document.getElementById('add-modal');
  if (!overlay) return;
  ['api-search-input','field-platform','field-score','field-notes','field-finish-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const resEl = document.getElementById('api-results');
  if (resEl) resEl.innerHTML = '';
  const selEl = document.getElementById('api-selected');
  if (selEl) { selEl.innerHTML = ''; selEl.style.display = 'none'; }
  overlay._selected = null;
}

let _searchTimeout = null;
function initModalSearch() {
  const input = document.getElementById('api-search-input');
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(_searchTimeout);
    const q = input.value.trim();
    if (q.length < 2) { document.getElementById('api-results').innerHTML = ''; return; }
    const resultsEl = document.getElementById('api-results');
    resultsEl.innerHTML = '<div style="padding:8px;color:var(--text3);font-size:0.8rem;display:flex;align-items:center;gap:8px;"><span class="spinner"></span> Buscando...</div>';
    _searchTimeout = setTimeout(async () => {
      const type = document.getElementById('add-modal').dataset.type;
      try {
        const results = await searchByType(type, q);
        renderApiResults(results, type);
      } catch (e) {
        resultsEl.innerHTML = '<div style="padding:8px;color:var(--red);font-size:0.8rem;">Error al buscar. Comprueba tu API key.</div>';
      }
    }, 500);
  });
}

function renderApiResults(results, type) {
  const el = document.getElementById('api-results');
  if (!results.length) { el.innerHTML = '<div style="padding:8px;color:var(--text3);font-size:0.8rem;">Sin resultados.</div>'; return; }
  el.innerHTML = results.map((r, i) => `
    <div class="api-result-item" onclick="selectApiResult(${i})">
      ${r.poster ? `<img src="${r.poster}" alt="">` : `<div style="width:36px;height:48px;background:var(--bg4);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:1rem;">${typeEmoji(type)}</div>`}
      <div class="api-result-info">
        <strong>${r.title}</strong>
        <span>${r.year || ''}${r.author ? ' · ' + r.author : ''}</span>
      </div>
    </div>
  `).join('');
  el._data = results;
}

function selectApiResult(idx) {
  const el = document.getElementById('api-results');
  const results = el._data;
  if (!results || !results[idx]) return;
  const r = results[idx];
  const overlay = document.getElementById('add-modal');
  overlay._selected = r;
  const type = overlay.dataset.type;
  el.innerHTML = '';
  document.getElementById('api-search-input').value = '';
  const selEl = document.getElementById('api-selected');
  selEl.style.display = 'flex';
  selEl.innerHTML = `
    ${r.poster ? `<img src="${r.poster}" alt="">` : `<div style="width:40px;height:54px;background:var(--bg4);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;">${typeEmoji(type)}</div>`}
    <div class="api-selected-info">
      <strong>${r.title}</strong>
      <span>${r.year || ''}${r.author ? ' · ' + r.author : ''}</span>
    </div>
    <button class="btn-sm" onclick="clearSelection()" style="margin-left:auto">✕</button>
  `;
}

function clearSelection() {
  const overlay = document.getElementById('add-modal');
  overlay._selected = null;
  const selEl = document.getElementById('api-selected');
  selEl.innerHTML = ''; selEl.style.display = 'none';
}

function saveFromModal(targetStatus) {
  const overlay = document.getElementById('add-modal');
  const selected = overlay._selected;
  if (!selected) { toast('Busca y selecciona un título primero', 'error'); return; }
  const type = overlay.dataset.type;
  const item = {
    type,
    status: targetStatus || 'pending',
    title: selected.title,
    year: selected.year || '',
    poster: selected.poster || null,
    apiId: selected.apiId,
    overview: selected.overview || '',
    author: selected.author || '',
    pages: selected.pages || '',
    platform: document.getElementById('field-platform')?.value || '',
    score: document.getElementById('field-score')?.value || '',
    notes: document.getElementById('field-notes')?.value || '',
    finishDate: document.getElementById('field-finish-date')?.value || '',
  };
  addItem(item);
  closeModal();
  toast(`"${item.title}" añadido correctamente`, 'success');
  if (typeof renderPage === 'function') renderPage();
  updateSidebarCounts();
}

// ── MODAL HTML ────────────────────────────────────────────────────────────────
function injectModal() {
  const html = `
  <div class="modal-overlay" id="add-modal" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <div class="modal-header">
        <h2 id="modal-title">Añadir título</h2>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Buscar título</label>
          <div class="api-search-wrap">
            <input type="text" id="api-search-input" placeholder="Escribe para buscar...">
          </div>
        </div>
        <div id="api-results" class="api-results"></div>
        <div id="api-selected" class="api-selected" style="display:none"></div>
        <div class="form-row">
          <div class="form-group">
            <label>Plataforma / Dónde</label>
            <input type="text" id="field-platform" placeholder="Netflix, Steam, Kindle...">
          </div>
          <div class="form-group">
            <label>Puntuación (1-10)</label>
            <input type="number" id="field-score" min="1" max="10" step="0.5" placeholder="—">
          </div>
        </div>
        <div class="form-group">
          <label>Fecha de finalización</label>
          <input type="date" id="field-finish-date">
        </div>
        <div class="form-group">
          <label>Notas personales</label>
          <textarea id="field-notes" placeholder="Tus impresiones, notas..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
        <button class="btn-add" onclick="saveFromModal('pending')">➕ Añadir como Pendiente</button>
        <button class="btn-add" onclick="saveFromModal('progress')" style="background:var(--blue);color:#fff">▶ Añadir en Progreso</button>
      </div>
    </div>
  </div>
  <div class="toast" id="toast"></div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  initModalSearch();
}

// ── KANBAN CARD HTML ──────────────────────────────────────────────────────────
function kanbanCardHTML(item) {
  const actions = [];
  if (item.status === 'pending') {
    actions.push(`<button class="btn-sm success" onclick="moveItem('${item.id}','progress')">▶ Empezar</button>`);
  }
  if (item.status === 'progress') {
    actions.push(`<button class="btn-sm success" onclick="moveItem('${item.id}','completed')">✓ Terminar</button>`);
    actions.push(`<button class="btn-sm danger" onclick="toggleAbandon('${item.id}')">⊘ Abandonar</button>`);
  }
  if (item.status === 'completed' || item.status === 'abandoned') {
    actions.push(`<button class="btn-sm warn" onclick="moveItem('${item.id}','progress')">↩ Retomar</button>`);
  }
  actions.push(`<button class="btn-sm danger" onclick="removeItem('${item.id}')">🗑</button>`);

  return `
    <div class="kanban-card ${item.status === 'abandoned' ? 'abandoned' : ''}" id="card-${item.id}">
      <div class="kanban-poster">${posterEl(item.poster, item.type, 'kanban-poster-placeholder')}</div>
      <div class="kanban-body">
        <div class="kanban-title" title="${item.title}">${item.title}</div>
        <div class="kanban-meta">${item.year || ''}${item.platform ? ' · ' + item.platform : ''}${item.author ? ' · ' + item.author : ''}</div>
        ${item.score ? `<div class="kanban-score">★ ${item.score}/10</div>` : ''}
        <div class="kanban-actions">${actions.join('')}</div>
      </div>
    </div>
  `;
}

function moveItem(id, newStatus) {
  updateItem(id, { status: newStatus });
  if (typeof renderPage === 'function') renderPage();
  updateSidebarCounts();
}

function toggleAbandon(id) {
  const data = loadData();
  const item = data.items.find(i => i.id === id);
  if (!item) return;
  const newStatus = item.status === 'abandoned' ? 'progress' : 'abandoned';
  updateItem(id, { status: newStatus });
  if (typeof renderPage === 'function') renderPage();
}

function removeItem(id) {
  if (!confirm('¿Eliminar este título?')) return;
  deleteItem(id);
  if (typeof renderPage === 'function') renderPage();
  updateSidebarCounts();
  toast('Eliminado', '');
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  injectModal();
  updateSidebarCounts();
});
