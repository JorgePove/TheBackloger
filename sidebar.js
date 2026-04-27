/**
 * sidebar.js — Componente de sidebar compartido
 * Inyecta el sidebar en todas las páginas y gestiona el año activo.
 * Elimina la duplicación de código HTML entre peliculas/series/animes/videojuegos/libros/tareas.
 */

(function () {
  'use strict';

  // ── YEAR PARAM ──────────────────────────────────────────────────────────────
  const params   = new URLSearchParams(window.location.search);
  const yearParam = params.get('year');

  function getYear() {
    if (yearParam) return yearParam;
    if (typeof getActiveYear === 'function') return String(getActiveYear());
    return String(new Date().getFullYear());
  }

  function addYear(href) {
    if (!href || href.startsWith('#')) return href;
    const y = getYear();
    if (!y) return href;
    return href.includes('?') ? href : href + '?year=' + y;
  }

  // ── DETECT CURRENT PAGE ─────────────────────────────────────────────────────
  const page = window.location.pathname.split('/').pop() || 'index.html';

  function isActive(href) {
    return page === href || (page === '' && href === 'index.html');
  }

  // ── NAV LINKS ───────────────────────────────────────────────────────────────
  const NAV = [
    { href: 'index.html',       icon: '⊞', label: 'Todos los medios' },
    { href: 'peliculas.html',   icon: '🎬', label: 'Películas'       },
    { href: 'series.html',      icon: '📺', label: 'Series'          },
    { href: 'animes.html',      icon: '🎌', label: 'Animes'          },
    { href: 'videojuegos.html', icon: '🎮', label: 'Videojuegos'     },
    { href: 'libros.html',      icon: '📚', label: 'Libros'          },
    { href: 'tareas.html',      icon: '✅', label: 'Tareas'          },
  ];

  // index.html does NOT get the year badge — only section pages do
  const isSubPage = page !== 'index.html' && page !== '';

  // ── BUILD HTML ──────────────────────────────────────────────────────────────
  function buildSidebar() {
    const yearBadgeHTML = isSubPage ? `
      <div class="sidebar-year-badge">
        <a href="index.html" class="back-to-menu" title="Volver al menú">← Menú</a>
        <span class="year-badge-pill" id="sidebar-year-label">${getYear()}</span>
      </div>` : '';

    const navHTML = NAV.map(({ href, icon, label }) => `
      <a href="${addYear(href)}" class="nav-item${isActive(href) ? ' active' : ''}">
        <span class="nav-icon">${icon}</span> ${label}
      </a>`).join('');

    return `
      <div class="sidebar-logo">
        <h1>El<span>.</span>Trackerino</h1>
        <p>Tu colección personal</p>
      </div>

      ${yearBadgeHTML}

      <span class="nav-label">Secciones</span>
      ${navHTML}

      <div class="sidebar-actions">
        <button class="sidebar-action-btn" onclick="exportData()" title="Exportar backup JSON">⬇ Exportar</button>
        <button class="sidebar-action-btn" onclick="importData()" title="Importar backup JSON">⬆ Importar</button>
      </div>

      <div class="sidebar-counts">
        <p>Total por categoría</p>
        <div class="count-row"><span>🎬 Películas</span><span class="count-badge" id="count-pelicula">0</span></div>
        <div class="count-row"><span>📺 Series</span><span class="count-badge" id="count-serie">0</span></div>
        <div class="count-row"><span>🎌 Animes</span><span class="count-badge" id="count-anime">0</span></div>
        <div class="count-row"><span>🎮 Videojuegos</span><span class="count-badge" id="count-videojuego">0</span></div>
        <div class="count-row"><span>📚 Libros</span><span class="count-badge" id="count-libro">0</span></div>
      </div>`;
  }

  // ── INJECT ──────────────────────────────────────────────────────────────────
  function inject() {
    const nav = document.querySelector('nav.sidebar');
    if (!nav) return;
    nav.innerHTML = buildSidebar();
  }

  // Run immediately if DOM is ready, otherwise wait
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

})();
