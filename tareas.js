// ── TAREAS STORAGE (year-aware) ───────────────────────────────────────────────
function getTareasKey() {
  const year = (typeof getActiveYear === 'function') ? getActiveYear() : new Date().getFullYear();
  return `trackerino_tareas_${year}_v1`;
}
// Backward compat migration for old key
(function migrateTareasOnce() {
  const year = new Date().getFullYear();
  const oldKey = 'mediatracker_tareas_v1';
  const newKey = `trackerino_tareas_${year}_v1`;
  try {
    const old = localStorage.getItem(oldKey);
    if (old && !localStorage.getItem(newKey)) localStorage.setItem(newKey, old);
  } catch(_) {}
})();

const COLORS = ['yellow','blue','green','red','orange','purple','pink','gray'];

function loadTareas() {
  try { return JSON.parse(localStorage.getItem(getTareasKey())) || { lists: [] }; }
  catch { return { lists: [] }; }
}
function saveTareas(data) {
  localStorage.setItem(getTareasKey(), JSON.stringify(data));
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function renderBoard() {
  const data = loadTareas();
  const board = document.getElementById('tareas-board');
  board.innerHTML = '';

  data.lists.forEach(list => {
    board.appendChild(buildListCol(list));
  });

  // Add list button
  const addBtn = document.createElement('button');
  addBtn.className = 'add-list-btn';
  addBtn.innerHTML = `<span style="font-size:1.4rem">＋</span> Nueva lista`;
  addBtn.onclick = addList;
  board.appendChild(addBtn);

  // Init drag for each list
  data.lists.forEach(list => initTaskDrag(list.id));

  updateSidebarCounts();
  // Update scroll arrows after render
  setTimeout(updateScrollArrows, 0);
}

function buildListCol(list) {
  const col = document.createElement('div');
  col.className = `task-list-col color-${list.color || 'yellow'}`;
  col.dataset.listId = list.id;

  const done = list.tasks.filter(t => t.done).length;
  const total = list.tasks.length;
  const pct = total ? Math.round(done / total * 100) : 0;

  col.innerHTML = `
    <div class="task-list-header">
      <div class="color-picker-wrap" data-list="${list.id}">
        <div class="color-dot ${list.color || 'yellow'}" onclick="togglePalette('${list.id}')"></div>
        <div class="color-palette" id="palette-${list.id}">
          ${COLORS.map(c => `<div class="color-palette-dot ${c} ${list.color === c ? 'active' : ''}" onclick="setColor('${list.id}','${c}')"></div>`).join('')}
        </div>
      </div>
      <input class="task-list-title"
             value="${escHtml(list.title)}"
             placeholder="Nombre de la lista"
             onchange="renameList('${list.id}', this.value)"
             onblur="renameList('${list.id}', this.value)">
      <span class="task-count-label" data-count-id="${list.id}">${done}/${total}</span>
      <button class="task-list-delete" onclick="deleteList('${list.id}')" title="Eliminar lista">✕</button>
    </div>
    <div class="task-progress-bar">
      <div class="task-progress-fill" id="progress-fill-${list.id}" style="width:${pct}%"></div>
    </div>
    <div class="task-items" id="tasks-${list.id}">
      ${list.tasks.map(t => buildTaskHTML(list.id, t)).join('')}
    </div>
    <div class="task-add-row">
      <input class="task-add-input"
             placeholder="+ Añadir tarea…"
             onkeydown="handleTaskInput(event, '${list.id}', this)">
    </div>
  `;
  return col;
}

function buildTaskHTML(listId, task) {
  return `
    <div class="task-item" data-task-id="${task.id}">
      <div class="task-drag-handle" title="Arrastrar">
        <span></span><span></span><span></span>
      </div>
      <input type="checkbox" class="task-checkbox" ${task.done ? 'checked' : ''}
             onchange="toggleTask('${listId}','${task.id}',this.checked)">
      <input type="text" class="task-text ${task.done ? 'done' : ''}"
             value="${escHtml(task.text)}"
             onchange="editTask('${listId}','${task.id}',this.value)"
             onkeydown="if(event.key==='Enter'){this.blur();}">
      <button class="task-delete" onclick="deleteTask('${listId}','${task.id}')" title="Eliminar">✕</button>
    </div>`;
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── ACTIONS ───────────────────────────────────────────────────────────────────
function addList() {
  const data = loadTareas();
  const id = Date.now().toString();
  data.lists.push({ id, title: 'Nueva lista', color: 'yellow', tasks: [] });
  saveTareas(data);
  renderBoard();
  // Focus the title
  setTimeout(() => {
    const input = document.querySelector(`[data-list-id="${id}"] .task-list-title`);
    if (input) { input.focus(); input.select(); }
  }, 50);
}

function deleteList(listId) {
  if (!confirm('¿Eliminar esta lista y todas sus tareas?')) return;
  const data = loadTareas();
  data.lists = data.lists.filter(l => l.id !== listId);
  saveTareas(data);
  renderBoard();
}

function renameList(listId, value) {
  const data = loadTareas();
  const list = data.lists.find(l => l.id === listId);
  if (list) { list.title = value; saveTareas(data); }
}

function setColor(listId, color) {
  const data = loadTareas();
  const list = data.lists.find(l => l.id === listId);
  if (list) { list.color = color; saveTareas(data); }
  closePalettes();
  renderBoard();
}

function togglePalette(listId) {
  closePalettes();
  const p = document.getElementById(`palette-${listId}`);
  if (p) p.classList.toggle('open');
}

function closePalettes() {
  document.querySelectorAll('.color-palette.open').forEach(p => p.classList.remove('open'));
}
document.addEventListener('click', e => {
  if (!e.target.closest('.color-picker-wrap')) closePalettes();
});

function handleTaskInput(e, listId, input) {
  if (e.key === 'Enter' && input.value.trim()) {
    addTask(listId, input.value.trim());
    input.value = '';
  }
}

function addTask(listId, text) {
  const data = loadTareas();
  const list = data.lists.find(l => l.id === listId);
  if (!list) return;
  const id = Date.now().toString();
  list.tasks.push({ id, text, done: false });
  saveTareas(data);
  reRenderList(listId);
}

function deleteTask(listId, taskId) {
  const data = loadTareas();
  const list = data.lists.find(l => l.id === listId);
  if (list) {
    list.tasks = list.tasks.filter(t => t.id !== taskId);
    saveTareas(data);
    reRenderList(listId);
  }
}

function toggleTask(listId, taskId, checked) {
  const data = loadTareas();
  const list = data.lists.find(l => l.id === listId);
  const task = list?.tasks.find(t => t.id === taskId);
  if (task) {
    task.done = checked;
    saveTareas(data);
    // Update text style without full re-render
    const textEl = document.querySelector(`[data-task-id="${taskId}"] .task-text`);
    if (textEl) textEl.classList.toggle('done', checked);
    updateProgress(listId, list);
  }
}

function editTask(listId, taskId, value) {
  const data = loadTareas();
  const list = data.lists.find(l => l.id === listId);
  const task = list?.tasks.find(t => t.id === taskId);
  if (task) { task.text = value; saveTareas(data); }
}

function reRenderList(listId) {
  const data = loadTareas();
  const list = data.lists.find(l => l.id === listId);
  if (!list) return;
  const container = document.getElementById(`tasks-${listId}`);
  if (container) container.innerHTML = list.tasks.map(t => buildTaskHTML(listId, t)).join('');
  updateProgress(listId, list);
  initTaskDrag(listId);
}

// Fix 5: robust selectors using IDs instead of span[style]
function updateProgress(listId, list) {
  const fill     = document.getElementById(`progress-fill-${listId}`);
  const countEl  = document.querySelector(`[data-count-id="${listId}"]`);
  if (!fill && !countEl) return;
  const done  = list.tasks.filter(t => t.done).length;
  const total = list.tasks.length;
  const pct   = total ? Math.round(done / total * 100) : 0;
  if (fill)    fill.style.width = pct + '%';
  if (countEl) countEl.textContent = `${done}/${total}`;
}

// ── TASK DRAG & DROP ──────────────────────────────────────────────────────────
let _tDrag = null;

function initTaskDrag(listId) {
  const container = document.getElementById(`tasks-${listId}`);
  if (!container) return;
  container.removeEventListener('pointerdown', _taskPointerDownHandler);
  container._taskListId = listId;
  container.addEventListener('pointerdown', _taskPointerDownHandler);
}

function _taskPointerDownHandler(e) {
  const handle = e.target.closest('.task-drag-handle');
  if (!handle) return;
  const item = handle.closest('.task-item');
  const container = handle.closest('.task-items');
  if (!item || !container) return;

  e.preventDefault();
  e.stopPropagation();

  const rect = item.getBoundingClientRect();
  const offsetY = e.clientY - rect.top;
  const offsetX = e.clientX - rect.left;

  const ghost = item.cloneNode(true);
  ghost.style.cssText = `
    position:fixed;top:${rect.top}px;left:${rect.left}px;
    width:${rect.width}px;height:${rect.height}px;
    z-index:9999;pointer-events:none;opacity:0.9;
    transform:scale(1.02);
    box-shadow:0 8px 24px rgba(0,0,0,0.6);
    border-radius:6px;background:var(--bg3);
    transition:none;
  `;
  document.body.appendChild(ghost);

  const placeholder = document.createElement('div');
  placeholder.className = 'task-drag-placeholder';
  item.after(placeholder);
  item.classList.add('dragging');

  _tDrag = { dragEl: item, ghost, placeholder, container, listId: container._taskListId, offsetY, offsetX };

  document.addEventListener('pointermove', _taskPointerMove, { passive: false });
  document.addEventListener('pointerup',   _taskPointerUp);
  document.addEventListener('pointercancel', _taskPointerCancel);
}

function _taskPointerMove(e) {
  if (!_tDrag) return;
  e.preventDefault();
  const { ghost, placeholder, container, offsetY, offsetX } = _tDrag;

  ghost.style.top  = (e.clientY - offsetY) + 'px';
  ghost.style.left = (e.clientX - offsetX) + 'px';

  const items = [...container.querySelectorAll('.task-item:not(.dragging)')];
  let afterEl = null;
  for (const c of items) {
    const box = c.getBoundingClientRect();
    if (e.clientY < box.top + box.height / 2) { afterEl = c; break; }
  }
  if (afterEl) container.insertBefore(placeholder, afterEl);
  else container.appendChild(placeholder);
}

function _taskPointerUp() {
  if (!_tDrag) return;
  const { dragEl, ghost, placeholder, container, listId } = _tDrag;
  placeholder.replaceWith(dragEl);
  dragEl.classList.remove('dragging');
  ghost.remove();
  saveTaskOrder(listId, container);
  _tDrag = null;
  document.removeEventListener('pointermove', _taskPointerMove);
  document.removeEventListener('pointerup',   _taskPointerUp);
  document.removeEventListener('pointercancel', _taskPointerCancel);
}

function _taskPointerCancel() {
  if (!_tDrag) return;
  const { dragEl, ghost, placeholder } = _tDrag;
  if (placeholder?.parentNode) placeholder.parentNode.removeChild(placeholder);
  dragEl.classList.remove('dragging');
  ghost.remove();
  _tDrag = null;
  document.removeEventListener('pointermove', _taskPointerMove);
  document.removeEventListener('pointerup',   _taskPointerUp);
  document.removeEventListener('pointercancel', _taskPointerCancel);
}

function saveTaskOrder(listId, container) {
  const data = loadTareas();
  const list = data.lists.find(l => l.id === listId);
  if (!list) return;
  const orderedIds = [...container.querySelectorAll('.task-item')].map(el => el.dataset.taskId);
  list.tasks = orderedIds.map(id => list.tasks.find(t => t.id === id)).filter(Boolean);
  saveTareas(data);
}

// ── BOARD SCROLL ARROWS ───────────────────────────────────────────────────────
function scrollBoard(dir) {
  const board = document.getElementById('tareas-board');
  board.scrollBy({ left: dir * 320, behavior: 'smooth' });
}

function updateScrollArrows() {
  const board = document.getElementById('tareas-board');
  if (!board) return;
  const btnLeft  = document.getElementById('scroll-left');
  const btnRight = document.getElementById('scroll-right');
  const overflows = board.scrollWidth > board.clientWidth + 8;
  const canScrollLeft  = overflows && board.scrollLeft > 4;
  const canScrollRight = overflows && board.scrollLeft + board.clientWidth < board.scrollWidth - 4;
  btnLeft.classList.toggle('visible', canScrollLeft);
  btnRight.classList.toggle('visible', canScrollRight);
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const board = document.getElementById('tareas-board');
  board.addEventListener('scroll', updateScrollArrows);
  window.addEventListener('resize', updateScrollArrows);
  renderBoard();
});
