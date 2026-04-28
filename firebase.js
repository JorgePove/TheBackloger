/**
 * firebase.js — Capa de sincronización Firebase para El.Trackerino
 *
 * Estrategia:
 *  - Lee/escribe en localStorage (funciona offline sin login).
 *  - Al hacer login, descarga datos de Firestore a localStorage ANTES
 *    de que la app renderice, sin ningún reload.
 *  - Cada escritura en localStorage se espeja a Firestore automáticamente.
 */

import { initializeApp }       from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
                                from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
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

const fbApp    = initializeApp(firebaseConfig);
const auth     = getAuth(fbApp);
const db       = getFirestore(fbApp);
const provider = new GoogleAuthProvider();

// ── STATE ─────────────────────────────────────────────────────────────────────
let currentUser = null;
let syncEnabled = false;

// ── GUARD KEY ─────────────────────────────────────────────────────────────────
// Stored in localStorage so it survives any reload.
// Format: fb_synced_{uid} = timestamp of last sync.
// We only re-sync if more than 5 minutes have passed (handles page navigation
// between sections without re-syncing every click).
const SYNC_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getSyncGuardKey(uid) { return `fb_synced_${uid}`; }

function hasSyncedRecently(uid) {
  const raw = localStorage.getItem(getSyncGuardKey(uid));
  if (!raw) return false;
  return (Date.now() - parseInt(raw, 10)) < SYNC_TTL_MS;
}

function markSynced(uid) {
  // Use the native setter to avoid triggering our own Firestore mirror
  _origSet.call(localStorage, getSyncGuardKey(uid), Date.now().toString());
}

// ── INTERCEPT localStorage WRITES ────────────────────────────────────────────
const _origGet = Storage.prototype.getItem;
const _origSet = Storage.prototype.setItem;

Storage.prototype.setItem = function (key, value) {
  _origSet.call(this, key, value);
  if (syncEnabled && currentUser && isTrackeringKey(key)) {
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
function userDocRef(key) {
  const safeKey = key.replace(/\//g, '__');
  return doc(db, 'users', currentUser.uid, 'data', safeKey);
}

async function firestoreGet(key) {
  try {
    const snap = await getDoc(userDocRef(key));
    return snap.exists() ? snap.data().value : null;
  } catch (e) {
    console.warn('Firestore read error:', e);
    return null;
  }
}

async function firestoreSet(key, value) {
  try {
    await setDoc(userDocRef(key), { value, updatedAt: Date.now() });
  } catch (e) {
    console.warn('Firestore write error:', e);
  }
}

// ── SYNC: FIRESTORE → localStorage ───────────────────────────────────────────
async function syncFromFirestore() {
  if (!currentUser) return;

  // Skip if we synced recently (navigating between pages)
  if (hasSyncedRecently(currentUser.uid)) {
    syncEnabled = true;
    return;
  }

  showFbToast('Sincronizando…', '');

  // Collect all trackerino keys from localStorage
  const keysToSync = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (isTrackeringKey(k)) keysToSync.push(k);
  }

  // Also pull year list from Firestore to discover keys that only exist remotely
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

  // Sync each key: remote wins if it exists, otherwise push local to remote
  await Promise.all(keysToSync.map(async key => {
    const remoteVal = await firestoreGet(key);
    if (remoteVal !== null) {
      // Write directly with native setter — does NOT trigger our mirror interceptor
      _origSet.call(localStorage, key, remoteVal);
    } else {
      const localVal = _origGet.call(localStorage, key);
      if (localVal !== null) await firestoreSet(key, localVal);
    }
  }));

  // Mark synced BEFORE enabling writes so the timestamp write doesn't loop
  markSynced(currentUser.uid);
  syncEnabled = true;

  showFbToast('Sincronizado ✓', 'success');

  // Reload ONCE so the page renders with the freshly pulled data.
  // The guard above ensures this reload does NOT trigger another sync.
  window.location.reload();
}

// ── AUTH STATE ────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  syncEnabled = false;
  renderAuthBar(user);
  if (user) await syncFromFirestore();
});

// ── AUTH ACTIONS ──────────────────────────────────────────────────────────────
async function doSignIn() {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error('Login error:', e);
    showFbToast('Error al iniciar sesión', 'error');
  }
}

async function doSignOut() {
  // Clear the sync guard so next login re-syncs
  if (currentUser) localStorage.removeItem(getSyncGuardKey(currentUser.uid));
  await signOut(auth);
  showFbToast('Sesión cerrada', '');
}

// ── AUTH BAR UI ───────────────────────────────────────────────────────────────
function renderAuthBar(user) {
  const bar = document.getElementById('fb-auth-bar');
  if (!bar) return;

  if (user) {
    bar.innerHTML = `
      <div class="fb-user">
        <img src="${user.photoURL || ''}" class="fb-avatar" alt="">
        <span class="fb-name">${user.displayName || user.email}</span>
        <button class="fb-btn fb-btn-out" id="fb-signout-btn">Cerrar sesión</button>
      </div>`;
    document.getElementById('fb-signout-btn').addEventListener('click', doSignOut);
  } else {
    bar.innerHTML = `
      <div class="fb-user">
        <span class="fb-hint">Sincroniza entre dispositivos</span>
        <button class="fb-btn fb-btn-in" id="fb-signin-btn">
          <svg width="14" height="14" viewBox="0 0 48 48" style="vertical-align:middle;margin-right:5px;flex-shrink:0"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Iniciar sesión con Google
        </button>
      </div>`;
    document.getElementById('fb-signin-btn').addEventListener('click', doSignIn);
  }
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function showFbToast(msg, type) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

window._fbAuth = auth;
