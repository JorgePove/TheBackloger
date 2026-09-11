/**
 * firebase.js — Capa de sincronización Firebase para El.Trackerino
 *
 * Estrategia (SIN LOGIN):
 *  - Uso personal, un único "dueño" de los datos. No hace falta iniciar sesión.
 *  - Lee/escribe en localStorage (funciona offline).
 *  - En cada carga de página, sincroniza automáticamente con un documento FIJO
 *    de Firestore (identificado por OWNER_ID, no por un usuario autenticado).
 *  - Cada escritura en localStorage se espeja a Firestore automáticamente.
 *
 * IMPORTANTE — SEGURIDAD:
 *  Al no haber login, las reglas de Firestore deben restringir el acceso
 *  únicamente a la ruta que usa OWNER_ID. Reglas recomendadas (pégalas en
 *  Firebase Console → Firestore Database → Reglas):
 *
 *  rules_version = '2';
 *  service cloud.firestore {
 *    match /databases/{database}/documents {
 *      match /trackerino_owner/OWNER_ID_AQUI/data/{doc} {
 *        allow read, write: if true;
 *      }
 *      match /{document=**} {
 *        allow read, write: if false;
 *      }
 *    }
 *  }
 *
 *  Sustituye OWNER_ID_AQUI por el mismo valor que hay abajo en OWNER_ID.
 *  Esto NO es una autenticación real: cualquiera que conozca ese ID podría
 *  escribir en ese documento. Al ser un ID largo y aleatorio que solo vive
 *  en tu código fuente, el riesgo es bajo para un tracker personal, pero
 *  no lo publiques en un repositorio público sin tenerlo en cuenta.
 */

import { initializeApp }       from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc }
                                from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── CONFIG ────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            'AIzaSyCb2NVxLn7sLiIxLX6xJn54cA84jYxUJK4',
  authDomain:        'eltrackerino.firebaseapp.com',
  projectId:         'eltrackerino',
  storageBucket:     'eltrackerino.firebasestorage.app',
  messagingSenderId: '384631840106',
  appId:             '1:384631840106:web:686424f4a17cc368369913'
};

// ID fijo que identifica "tus" datos en Firestore. No es un usuario logueado,
// es simplemente la carpeta donde vive todo. Si lo cambias perderás acceso a
// los datos ya sincronizados con el anterior (tendrías que migrarlos a mano).
const OWNER_ID = 'owner-c405950c-88ff-4fe6-a51d-3d32f91a90e8';

const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

// ── STATE ─────────────────────────────────────────────────────────────────────
let syncEnabled = false;

// ── GUARD KEY ─────────────────────────────────────────────────────────────────
// Evita re-sincronizar en cada navegación entre páginas dentro de una sesión.
const SYNC_TTL_MS = 5 * 60 * 1000; // 5 minutos
const SYNC_GUARD_KEY = 'fb_synced_at';

function hasSyncedRecently() {
  const raw = localStorage.getItem(SYNC_GUARD_KEY);
  if (!raw) return false;
  return (Date.now() - parseInt(raw, 10)) < SYNC_TTL_MS;
}
function markSynced() {
  // Usar el setter nativo para no disparar el espejo a Firestore
  _origSet.call(localStorage, SYNC_GUARD_KEY, Date.now().toString());
}

// ── INTERCEPT localStorage WRITES ────────────────────────────────────────────
const _origGet = Storage.prototype.getItem;
const _origSet = Storage.prototype.setItem;

Storage.prototype.setItem = function (key, value) {
  _origSet.call(this, key, value);
  if (syncEnabled && isTrackeringKey(key)) {
    firestoreSet(key, value); // fire-and-forget, non-blocking
  }
};

function isTrackeringKey(key) {
  return (
    key.startsWith('mediatracker_') ||
    key.startsWith('trackerino_')   ||
    key === 'trackerino_active_year'
  );
}

// ── FIRESTORE HELPERS ─────────────────────────────────────────────────────────
function ownerDocRef(key) {
  const safeKey = key.replace(/\//g, '__');
  return doc(db, 'trackerino_owner', OWNER_ID, 'data', safeKey);
}

async function firestoreGet(key) {
  try {
    const snap = await getDoc(ownerDocRef(key));
    return snap.exists() ? snap.data().value : null;
  } catch (e) {
    console.warn('Firestore read error:', e);
    return null;
  }
}

async function firestoreSet(key, value) {
  try {
    await setDoc(ownerDocRef(key), { value, updatedAt: Date.now() });
  } catch (e) {
    console.warn('Firestore write error:', e);
  }
}

// ── SYNC: FIRESTORE → localStorage ───────────────────────────────────────────
async function syncFromFirestore() {
  if (hasSyncedRecently()) {
    syncEnabled = true;
    updateSyncBadge('ok');
    return;
  }

  updateSyncBadge('syncing');

  let hadError = false;
  let changed  = false;

  try {
    // Collect all trackerino keys from localStorage
    const keysToSync = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (isTrackeringKey(k)) keysToSync.push(k);
    }

    // Pull la lista de años desde Firestore para descubrir keys que solo
    // existan en la nube (p.ej. añadidas desde otro dispositivo)
    const remoteYearsRaw = await firestoreGet('trackerino_years_v1');
    if (remoteYearsRaw) {
      try {
        JSON.parse(remoteYearsRaw).forEach(year => {
          [`mediatracker_${year}_v1`, `trackerino_tareas_${year}_v1`].forEach(k => {
            if (!keysToSync.includes(k)) keysToSync.push(k);
          });
        });
        ['trackerino_years_v1', 'trackerino_active_year'].forEach(k => {
          if (!keysToSync.includes(k)) keysToSync.push(k);
        });
      } catch (_) {}
    }

    // Sync cada key: si hay valor remoto, gana remoto; si no, se sube el local.
    await Promise.all(keysToSync.map(async key => {
      const remoteVal = await firestoreGet(key);
      if (remoteVal !== null) {
        const localVal = _origGet.call(localStorage, key);
        if (remoteVal !== localVal) {
          _origSet.call(localStorage, key, remoteVal); // setter nativo, no espeja
          changed = true;
        }
      } else {
        const localVal = _origGet.call(localStorage, key);
        if (localVal !== null) await firestoreSet(key, localVal);
      }
    }));
  } catch (e) {
    console.warn('Sync error:', e);
    hadError = true;
  }

  markSynced();
  syncEnabled = true;

  if (hadError) {
    updateSyncBadge('error');
    return;
  }

  updateSyncBadge('ok');

  // Solo recargamos si de verdad ha cambiado algo, para no molestar
  // con recargas innecesarias en cada visita.
  if (changed) {
    window.location.reload();
  }
}

// ── STATUS BADGE UI ───────────────────────────────────────────────────────────
function updateSyncBadge(state) {
  const bar = document.getElementById('fb-auth-bar');
  if (!bar) return;

  if (state === 'syncing') {
    bar.innerHTML = `<div class="fb-status fb-syncing"><span class="spinner"></span> Sincronizando…</div>`;
  } else if (state === 'ok') {
    bar.innerHTML = `<div class="fb-status fb-ok">☁ Sincronizado</div>`;
  } else if (state === 'error') {
    bar.innerHTML = `<div class="fb-status fb-err">⚠ Sin conexión — trabajando en local</div>`;
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────
syncFromFirestore();

window._fbDb = db;
