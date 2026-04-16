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
const API_KEYS = {
  tmdb: 'fec38edbf4018f563595e1487467be77',
  googleBooks: 'AIzaSyBgpE84O0QIZol1kRjGMgY3nTi-67CiK6s',
  rawg: 'a7e92d02270f400b8eb4af98af6ce7b8',
};

// ── API SEARCH ────────────────────────────────────────────────────────────────
async function searchTMDB(query, mediaType = 'movie') {
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

function posterEl(poster, type, className = '') {
  if (poster) return `<img src="${poster}" alt="poster" onerror="this.parentElement.innerHTML='<div class=\\"${className || 'card-poster-placeholder'}\\">${typeEmoji(type)}</div>'">`;
  return `<div class="${className || 'card-poster-placeholder'}">${typeEmoji(type)}</div>`;
}

function formatDate(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
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

// ── SCORE POPUP ───────────────────────────────────────────────────────────────
function openScorePopup(onDone) {
  const existing = document.getElementById('score-popup-overlay');
  if (existing) existing.remove();

  const html = `
  <div class="score-popup-overlay" id="score-popup-overlay">
    <div class="score-popup">
      <div class="score-popup-header">
        <div class="score-popup-icon">★</div>
        <h3>¿Qué puntuación le das?</h3>
        <p>Puedes omitirla si prefieres no puntuar ahora</p>
      </div>
      <div class="score-popup-body">
        <div class="score-value-display" id="score-value-display">—</div>
        <div class="score-slider-wrap">
          <span class="score-tick-label">0</span>
          <input type="range" id="score-range" min="0" max="10" step="0.5" value="0">
          <span class="score-tick-label">10</span>
        </div>
        <div class="score-stars" id="score-stars">
          ${[2,4,6,8,10].map(v => `<span class="score-ref" data-val="${v}">${v}</span>`).join('')}
        </div>
      </div>
      <div class="score-popup-footer">
        <button class="btn-cancel" id="score-skip-btn">Sin puntuación</button>
        <button class="btn-add" id="score-confirm-btn">Confirmar ✓</button>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);

  const range = document.getElementById('score-range');
  const display = document.getElementById('score-value-display');
  let hasInteracted = false;

  range.addEventListener('input', () => {
    hasInteracted = true;
    const v = parseFloat(range.value);
    display.textContent = v.toFixed(1) + ' / 10';
    display.style.color = v >= 7 ? 'var(--green)' : v >= 5 ? 'var(--accent)' : v > 0 ? 'var(--orange)' : 'var(--text3)';
  });

  document.getElementById('score-confirm-btn').addEventListener('click', () => {
    const v = parseFloat(range.value);
    closeScorePopup(hasInteracted && v > 0 ? range.value : null, onDone);
  });

  document.getElementById('score-skip-btn').addEventListener('click', () => {
    closeScorePopup(null, onDone);
  });

  requestAnimationFrame(() => {
    document.getElementById('score-popup-overlay').classList.add('open');
  });
}

function closeScorePopup(score, onDone) {
  const overlay = document.getElementById('score-popup-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => {
    overlay.remove();
    if (onDone) onDone(score);
  }, 220);
}

// ── MOVE ITEM ────────────────────────────────────────────────────────────────
function moveItem(id, newStatus) {
  if (newStatus === 'completed') {
    openScorePopup((score) => {
      const updates = {
        status: 'completed',
        completedAt: new Date().toISOString(),
      };
      if (score !== null) updates.score = score;
      updateItem(id, updates);
      if (typeof renderPage === 'function') renderPage();
      updateSidebarCounts();
      toast('¡Completado! 🎉', 'success');
    });
    return;
  }

  const updates = { status: newStatus };
  if (newStatus === 'progress') updates.startedAt = new Date().toISOString();
  if (newStatus === 'abandoned') updates.completedAt = new Date().toISOString();

  updateItem(id, updates);
  if (typeof renderPage === 'function') renderPage();
  updateSidebarCounts();
}

function removeItem(id) {
  if (!confirm('¿Eliminar este título?')) return;
  deleteItem(id);
  if (typeof renderPage === 'function') renderPage();
  updateSidebarCounts();
  toast('Eliminado', '');
}

// ── MODAL LOGIC ───────────────────────────────────────────────────────────────
function openModal(type, editId) {
  const overlay = document.getElementById('add-modal');
  if (!overlay) return;
  // Reset first (clears _selected, editId, inputs), then set new state
  resetModal();
  overlay.classList.add('open');
  overlay.dataset.type = type;
  overlay.dataset.editId = editId || '';
  updatePlatformDropdown(type, '');

  if (editId) {
    const data = loadData();
    const item = data.items.find(i => i.id === editId);
    if (!item) return;
    document.getElementById('modal-title').textContent = `Editar ${typeLabel(type)}`;
    overlay._selected = {
      title: item.title,
      year: item.year,
      poster: item.poster,
      apiId: item.apiId,
      overview: item.overview,
      author: item.author,
      pages: item.pages,
    };
    const selEl = document.getElementById('api-selected');
    selEl.style.display = 'flex';
    selEl.innerHTML = `
      ${item.poster ? `<img src="${item.poster}" alt="">` : `<div style="width:40px;height:54px;background:var(--bg4);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;">${typeEmoji(type)}</div>`}
      <div class="api-selected-info">
        <strong>${item.title}</strong>
        <span>${item.year || ''}${item.author ? ' · ' + item.author : ''}</span>
      </div>
      <button class="btn-sm" onclick="clearSelection()" style="margin-left:auto">✕</button>
    `;
    updatePlatformDropdown(type, item.platform || '');
    if (item.score) document.getElementById('field-score').value = item.score;
    if (item.notes) document.getElementById('field-notes').value = item.notes;

    // Inject date fields (edit mode only)
    const datesWrap = document.getElementById('modal-dates-wrap');
    if (datesWrap) {
      const isoToDateInput = (isoStr) => {
        if (!isoStr) return '';
        try { return new Date(isoStr).toISOString().slice(0, 10); } catch (e) { return ''; }
      };
      datesWrap.style.display = 'block';
      datesWrap.innerHTML = `
        <div class="form-row" style="grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div class="form-group">
            <label>📅 Fecha añadido</label>
            <input type="date" id="field-createdAt" value="${isoToDateInput(item.createdAt)}">
          </div>
          <div class="form-group">
            <label>▶ Fecha iniciado</label>
            <input type="date" id="field-startedAt" value="${isoToDateInput(item.startedAt)}">
          </div>
          <div class="form-group">
            <label>✓ Fecha terminado</label>
            <input type="date" id="field-completedAt" value="${isoToDateInput(item.completedAt)}">
          </div>
        </div>
      `;
    }

    document.getElementById('modal-footer-add').style.display = 'none';
    document.getElementById('modal-footer-edit').style.display = 'flex';
  } else {
    document.getElementById('modal-title').textContent = `Añadir ${typeLabel(type)}`;
    document.getElementById('modal-footer-add').style.display = 'flex';
    document.getElementById('modal-footer-edit').style.display = 'none';
  }
}

function closeModal() {
  const overlay = document.getElementById('add-modal');
  if (overlay) overlay.classList.remove('open');
  resetModal();
}

function resetModal() {
  const overlay = document.getElementById('add-modal');
  if (!overlay) return;
  ['api-search-input','field-score','field-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const datesWrap = document.getElementById('modal-dates-wrap');
  if (datesWrap) { datesWrap.style.display = 'none'; datesWrap.innerHTML = ''; }
  const resEl = document.getElementById('api-results');
  if (resEl) resEl.innerHTML = '';
  const selEl = document.getElementById('api-selected');
  if (selEl) { selEl.innerHTML = ''; selEl.style.display = 'none'; }
  overlay._selected = null;
  overlay.dataset.editId = '';
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
  };
  if (targetStatus === 'progress') item.startedAt = new Date().toISOString();
  addItem(item);
  closeModal();
  toast(`"${item.title}" añadido correctamente`, 'success');
  if (typeof renderPage === 'function') renderPage();
  updateSidebarCounts();
}

function saveEditFromModal() {
  const overlay = document.getElementById('add-modal');
  const editId = overlay.dataset.editId;
  if (!editId) return;
  const selected = overlay._selected;
  if (!selected) { toast('Selecciona un título', 'error'); return; }

  // Helper: convert date input value (YYYY-MM-DD) to ISO string, or null
  function dateFieldToISO(fieldId) {
    const el = document.getElementById(fieldId);
    if (!el || !el.value) return null;
    return new Date(el.value).toISOString();
  }

  const updates = {
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
  };

  // Only update date fields if they exist in the modal (edit mode only)
  const createdVal  = dateFieldToISO('field-createdAt');
  const startedVal  = dateFieldToISO('field-startedAt');
  const completedVal = dateFieldToISO('field-completedAt');
  if (document.getElementById('field-createdAt'))   updates.createdAt   = createdVal;
  if (document.getElementById('field-startedAt'))   updates.startedAt   = startedVal;
  if (document.getElementById('field-completedAt')) updates.completedAt = completedVal;

  updateItem(editId, updates);
  closeModal();
  toast(`"${updates.title}" actualizado`, 'success');
  if (typeof renderPage === 'function') renderPage();
  updateSidebarCounts();
}

// ── PLATFORM OPTIONS PER TYPE ─────────────────────────────────────────────────
const PLATFORM_OPTIONS = {
  pelicula: ['—', 'Netflix', 'Prime Video', 'Disney+', 'HBO Max', 'Movistar+', 'Cine', 'Pirata'],
  serie:    ['—', 'Netflix', 'Prime Video', 'Disney+', 'HBO Max', 'Movistar+', 'Cine', 'Pirata'],
  anime:    ['—', 'Crunchyroll', 'Pirata'],
  videojuego: [
    '—',
    'PC', 'Móvil',
    'PS5', 'PS4', 'PS3', 'PS2', 'PS1', 'PSP', 'PS Vita',
    'Xbox Series X/S', 'Xbox One', 'Xbox 360', 'Xbox',
    'Nintendo Switch', 'Wii U', 'Wii', 'GameCube', 'N64',
    'Game Boy / GBA', 'Nintendo DS', 'Nintendo 3DS',
  ],
  libro: ['—', 'Físico', 'Kindle', 'Audiolibro'],
};

function getPlatformOptions(type) {
  return PLATFORM_OPTIONS[type] || ['—'];
}

function buildPlatformSelect(type, currentValue) {
  const opts = getPlatformOptions(type);
  return `<select id="field-platform" class="platform-select">
    ${opts.map(o => `<option value="${o === '—' ? '' : o}" ${currentValue && currentValue === o ? 'selected' : ''}>${o}</option>`).join('')}
  </select>`;
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
            <div id="platform-field-wrap">
              <select id="field-platform" class="platform-select"><option value="">—</option></select>
            </div>
          </div>
          <div class="form-group">
            <label>Puntuación (0-10)</label>
            <input type="number" id="field-score" min="0" max="10" step="0.5" placeholder="—">
          </div>
        </div>
        <div class="form-group">
          <label>Notas personales</label>
          <textarea id="field-notes" placeholder="Tus impresiones, notas..."></textarea>
        </div>
        <div id="modal-dates-wrap" style="display:none"></div>
      </div>
      <div class="modal-footer" id="modal-footer-add">
        <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
        <button class="btn-add" onclick="saveFromModal('pending')">➕ Añadir como Pendiente</button>
        <button class="btn-add" onclick="saveFromModal('progress')" style="background:var(--blue);color:#fff">▶ Añadir en Progreso</button>
      </div>
      <div class="modal-footer" id="modal-footer-edit" style="display:none">
        <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
        <button class="btn-add" onclick="saveEditFromModal()" style="background:var(--blue);color:#fff">💾 Guardar cambios</button>
      </div>
    </div>
  </div>
  <div class="toast" id="toast"></div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  initModalSearch();
}

function updatePlatformDropdown(type, currentValue) {
  const wrap = document.getElementById('platform-field-wrap');
  if (wrap) wrap.innerHTML = buildPlatformSelect(type, currentValue);
}

// ── KANBAN CARD HTML ──────────────────────────────────────────────────────────
function kanbanCardHTML(item) {
  const actions = [];

  if (item.status === 'pending') {
    actions.push(`<button class="btn-sm success" onclick="moveItem('${item.id}','progress')">▶ Empezar</button>`);
  }
  if (item.status === 'progress') {
    actions.push(`<button class="btn-sm success" onclick="moveItem('${item.id}','completed')">✓ Terminar</button>`);
    actions.push(`<button class="btn-sm danger" onclick="moveItem('${item.id}','abandoned')">⊘ Abandonar</button>`);
  }
  if (item.status === 'completed' || item.status === 'abandoned') {
    actions.push(`<button class="btn-sm warn" onclick="moveItem('${item.id}','progress')">↩ Retomar</button>`);
  }
  actions.push(`<button class="btn-sm" onclick="openModal('${item.type}','${item.id}')" title="Editar">✏️</button>`);
  actions.push(`<button class="btn-sm danger" onclick="removeItem('${item.id}')">🗑</button>`);

  // Dates — compact
  const dateParts = [];
  if (item.createdAt) dateParts.push(`📅 ${formatDate(item.createdAt)}`);
  if (item.startedAt) dateParts.push(`▶ ${formatDate(item.startedAt)}`);
  if (item.completedAt) dateParts.push(`✓ ${formatDate(item.completedAt)}`);

  const statusBadge = item.status === 'abandoned'
    ? `<span class="kanban-badge badge-abandoned">Abandonado</span>`
    : '';

  const bgStyle = item.poster ? `style="--card-bg:url('${item.poster}')"` : '';
  const posterHTML = item.poster
    ? `<img src="${item.poster}" alt="${item.title}" class="kc-poster-img">`
    : `<div class="kc-poster-placeholder">${typeEmoji(item.type)}</div>`;

  return `
    <div class="kanban-card ${item.status === 'abandoned' ? 'abandoned' : ''} ${item.poster ? 'has-poster-bg' : ''}"
         id="card-${item.id}" data-id="${item.id}" ${bgStyle}>
      <div class="kanban-card-bg"></div>

      <!-- Poster — clickable for detail popup -->
      <div class="kc-poster" onclick="openDetailPopup('${item.id}')" title="Ver detalles">
        ${posterHTML}
        <div class="kc-poster-overlay"><span>🔍</span></div>
      </div>

      <!-- Body -->
      <div class="kc-body">
        <div class="kc-top">
          <div class="drag-handle kc-drag" title="Arrastrar">
            <span></span><span></span><span></span>
          </div>
          <div class="kc-title" title="${item.title}">${item.title}</div>
          ${statusBadge}
        </div>

        <div class="kc-meta">
          ${item.year ? `<span>${item.year}</span>` : ''}
          ${item.platform ? `<span class="kc-platform">${item.platform}</span>` : ''}
          ${item.author ? `<span>${item.author}</span>` : ''}
        </div>

        ${item.score ? `<div class="kc-score">★ ${item.score}<span>/10</span></div>` : ''}

        ${dateParts.length ? `<div class="kc-dates">${dateParts.join(' · ')}</div>` : ''}

        <div class="kc-actions">${actions.join('')}</div>
      </div>
    </div>
  `;
}

// ── KANBAN DRAG & DROP ────────────────────────────────────────────────────────
// Uses a single document-level pointermove/pointerup so cloneNode doesn't break capture
let _kDrag = null; // { dragEl, ghost, placeholder, col, offsetY }

function initKanbanDrag(colId) {
  const col = document.getElementById(colId);
  if (!col) return;

  // Stamp the colId so we can find it later
  col.dataset.colId = colId;

  col.addEventListener('pointerdown', _kanbanPointerDown);
}

function _kanbanPointerDown(e) {
  const handle = e.target.closest('.drag-handle');
  if (!handle) return;
  const card = handle.closest('.kanban-card');
  const col  = handle.closest('.kanban-items');
  if (!card || !col) return;

  e.preventDefault();
  e.stopPropagation();

  const rect = card.getBoundingClientRect();
  const offsetY = e.clientY - rect.top;
  const offsetX = e.clientX - rect.left;

  // Ghost
  const ghost = card.cloneNode(true);
  ghost.style.cssText = `
    position:fixed;top:${rect.top}px;left:${rect.left}px;
    width:${rect.width}px;height:${rect.height}px;
    z-index:9999;pointer-events:none;opacity:0.88;
    transform:rotate(1.5deg) scale(1.03);
    box-shadow:0 20px 50px rgba(0,0,0,0.7);
    border-radius:8px;transition:none;
  `;
  document.body.appendChild(ghost);

  // Placeholder
  const placeholder = document.createElement('div');
  placeholder.className = 'drag-placeholder';
  placeholder.style.height = rect.height + 'px';
  card.after(placeholder);
  card.classList.add('dragging');

  _kDrag = { dragEl: card, ghost, placeholder, col, offsetY, offsetX };

  document.addEventListener('pointermove', _kanbanPointerMove, { passive: false });
  document.addEventListener('pointerup',   _kanbanPointerUp);
  document.addEventListener('pointercancel', _kanbanPointerCancel);
}

function _kanbanPointerMove(e) {
  if (!_kDrag) return;
  e.preventDefault();
  const { ghost, placeholder, col, offsetY, offsetX } = _kDrag;

  ghost.style.top  = (e.clientY - offsetY) + 'px';
  ghost.style.left = (e.clientX - offsetX) + 'px';

  // Insertion point
  const cards = [...col.querySelectorAll('.kanban-card:not(.dragging)')];
  let afterEl = null;
  for (const c of cards) {
    const box = c.getBoundingClientRect();
    if (e.clientY < box.top + box.height / 2) { afterEl = c; break; }
  }
  if (afterEl) col.insertBefore(placeholder, afterEl);
  else col.appendChild(placeholder);
}

function _kanbanPointerUp(e) {
  if (!_kDrag) return;
  const { dragEl, ghost, placeholder } = _kDrag;
  placeholder.replaceWith(dragEl);
  dragEl.classList.remove('dragging');
  ghost.remove();
  _kDrag = null;
  document.removeEventListener('pointermove', _kanbanPointerMove);
  document.removeEventListener('pointerup',   _kanbanPointerUp);
  document.removeEventListener('pointercancel', _kanbanPointerCancel);
}

function _kanbanPointerCancel() {
  if (!_kDrag) return;
  const { dragEl, ghost, placeholder } = _kDrag;
  if (placeholder?.parentNode) placeholder.parentNode.removeChild(placeholder);
  dragEl.classList.remove('dragging');
  ghost.remove();
  _kDrag = null;
  document.removeEventListener('pointermove', _kanbanPointerMove);
  document.removeEventListener('pointerup',   _kanbanPointerUp);
  document.removeEventListener('pointercancel', _kanbanPointerCancel);
}

// ── DETAIL POPUP ──────────────────────────────────────────────────────────────
function openDetailPopup(id) {
  const data = loadData();
  const item = data.items.find(i => i.id === id);
  if (!item) return;

  const existing = document.getElementById('detail-popup-overlay');
  if (existing) existing.remove();

  const statusColors = { pending: 'var(--orange)', progress: 'var(--blue)', completed: 'var(--green)', abandoned: 'var(--red)' };
  const statusColor  = statusColors[item.status] || 'var(--text2)';

  // Date rows
  const dateRows = [];
  if (item.createdAt)   dateRows.push(`<div class="dp-date-row"><span>📅 Añadido</span><strong>${formatDate(item.createdAt)}</strong></div>`);
  if (item.startedAt)   dateRows.push(`<div class="dp-date-row"><span>▶ Iniciado</span><strong>${formatDate(item.startedAt)}</strong></div>`);
  if (item.completedAt) dateRows.push(`<div class="dp-date-row"><span>✓ ${item.status === 'abandoned' ? 'Abandonado' : 'Terminado'}</span><strong>${formatDate(item.completedAt)}</strong></div>`);

  const html = `
  <div class="dp-overlay" id="detail-popup-overlay" onclick="if(event.target===this)closeDetailPopup()">
    <!-- Blurred backdrop -->
    <div class="dp-backdrop" ${item.poster ? `style="background-image:url('${item.poster}')"` : ''}></div>

    <div class="dp-modal">
      <!-- Header with poster + hero info -->
      <div class="dp-hero">
        <div class="dp-hero-bg" ${item.poster ? `style="background-image:url('${item.poster}')"` : ''}></div>
        <div class="dp-hero-content">
          <div class="dp-poster-wrap">
            ${item.poster ? `<img src="${item.poster}" alt="${item.title}" class="dp-poster">` : `<div class="dp-poster-placeholder">${typeEmoji(item.type)}</div>`}
          </div>
          <div class="dp-hero-info">
            <div class="dp-type-badge">${typeEmoji(item.type)} ${typeLabel(item.type)}</div>
            <h2 class="dp-title">${item.title}</h2>
            ${item.year ? `<div class="dp-year">${item.year}</div>` : ''}
            <div class="dp-status-row">
              <span class="dp-status-dot" style="background:${statusColor}"></span>
              <span class="dp-status-text" style="color:${statusColor}">${statusLabel(item.status).toUpperCase()}</span>
              ${item.platform ? `<span class="dp-platform">${item.platform}</span>` : ''}
              ${item.score ? `<span class="dp-score-hero">★ ${item.score}/10</span>` : ''}
            </div>
            ${item.author ? `<div class="dp-author">por ${item.author}</div>` : ''}
          </div>
        </div>
        <button class="dp-close" onclick="closeDetailPopup()">✕</button>
      </div>

      <!-- Body -->
      <div class="dp-body">
        <!-- Overview -->
        ${item.overview ? `
        <div class="dp-section">
          <div class="dp-section-label">Sinopsis</div>
          <p class="dp-overview">${item.overview}</p>
        </div>` : ''}

        <!-- Dates & meta -->
        ${dateRows.length ? `
        <div class="dp-section">
          <div class="dp-section-label">Fechas</div>
          <div class="dp-dates-grid">${dateRows.join('')}</div>
        </div>` : ''}

        <!-- Notes — editable -->
        <div class="dp-section">
          <div class="dp-section-label">Notas personales</div>
          <textarea class="dp-notes-input" id="dp-notes-${id}" placeholder="Escribe tus impresiones, notas…">${item.notes || ''}</textarea>
          <button class="dp-save-notes" onclick="saveDetailNotes('${id}')">💾 Guardar notas</button>
        </div>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  requestAnimationFrame(() => {
    document.getElementById('detail-popup-overlay').classList.add('open');
  });
}

function closeDetailPopup() {
  const overlay = document.getElementById('detail-popup-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => overlay.remove(), 250);
}

function saveDetailNotes(id) {
  const ta = document.getElementById(`dp-notes-${id}`);
  if (!ta) return;
  updateItem(id, { notes: ta.value });
  toast('Notas guardadas', 'success');
  if (typeof renderPage === 'function') renderPage();
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  injectModal();
  updateSidebarCounts();
});

function initAllDrag() {
  ['col-pending','col-progress','col-completed'].forEach(initKanbanDrag);
}
