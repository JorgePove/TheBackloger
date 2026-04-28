/**
 * firebase.js — Capa de sincronización Firebase para El.Trackerino
 *
 * Estrategia:
 *  - Lee/escribe en localStorage igual que antes (funciona offline).
 *  - Si el usuario está autenticado, sincroniza con Firestore en cada
 *    lectura y escritura, de forma transparente para el resto del código.
 *  - El login es con Google, un solo clic.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── CONFIG ────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            'AIzaSyCb2NVxLn7sLiIxLX6xJn54cA84jYxUJK4',
  authDomain:        'eltrackerino.firebaseapp.com',
  projectId:         'eltrackerino',
  storageBucket:     'eltrackerino.firebasestorage.app',
  messagingSenderId: '384631840106',
  appId:             '1:384631840106:web:686424f4a17cc368369913'
};

const fbApp  = initializeApp(firebaseConfig);
const auth   = getAuth(fbApp);
const db     = getFirestore(fbApp);
const provider = new GoogleAuthProvider();

// ── STATE ─────────────────────────────────────────────────────────────────────
let currentUser = null;
let syncEnabled = false;

// ── AUTH UI ───────────────────────────────────────────────────────────────────
function renderAuthBar(user) {
  let bar = document.getElementById('fb-auth-bar');
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
        <span class="fb-hint">Sincroniza tus datos entre dispositivos</span>
        <button class="fb-btn fb-btn-in" id="fb-signin-btn">
          <svg width="16" height="16" viewBox="0 0 48 48" style="vertical-align:middle;margin-right:6px"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Iniciar sesión con Google
        </button>
      </div>`;
    document.getElementById('fb-signin-btn').addEventListener('click', doSignIn);
  }
}

// ── SIGN IN / OUT ─────────────────────────────────────────────────────────────
async function doSignIn() {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error('Login error:', e);
    showFbToast('Error al iniciar sesión', 'error');
  }
}

async function doSignOut() {
  await signOut(auth);
  showFbToast('Sesión cerrada — los datos siguen en local', '');
}

// ── FIRESTORE HELPERS ─────────────────────────────────────────────────────────
function userDocRef(key) {
  // Each localStorage key becomes a Firestore document under users/{uid}/data/{key}
  // Firestore doc IDs can't contain '/' so we encode it
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

// ── INTERCEPT localStorage ────────────────────────────────────────────────────
// We wrap the native getItem/setItem so the rest of the code doesn't change.
const _origGet = Storage.prototype.getItem;
const _origSet = Storage.prototype.setItem;

Storage.prototype.getItem = function (key) {
  return _origGet.call(this, key);
};

Storage.prototype.setItem = function (key, value) {
  _origSet.call(this, key, value);
  // Mirror to Firestore if logged in and this is a trackerino key
  if (syncEnabled && currentUser && isTrackeringKey(key)) {
    firestoreSet(key, value);
  }
};

function isTrackeringKey(key) {
  return key.startsWith('mediatracker_') ||
         key.startsWith('trackerino_') ||
         key === 'trackerino_active_year';
}

// ── PULL FROM FIRESTORE → localStorage ───────────────────────────────────────
async function pullAllFromFirestore() {
  if (!currentUser) return;

  // ── ANTI-LOOP GUARD ──────────────────────────────────────────────────────
  // sessionStorage lives only for this browser tab session.
  // If we already synced since the last manual navigation, skip.
  const syncedKey = `fb_synced_${currentUser.uid}`;
  if (sessionStorage.getItem(syncedKey)) {
    // Already synced this session — just enable writes and return
    syncEnabled = true;
    return;
  }

  showFbToast('Sincronizando datos…', '');

  // Get all keys we care about from local first
  const keysToSync = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (isTrackeringKey(k)) keysToSync.push(k);
  }

  // Also fetch years list from Firestore (may have keys we don't have locally)
  const remoteYearsRaw = await firestoreGet('trackerino_years_v1');
  if (remoteYearsRaw) {
    try {
      const remoteYears = JSON.parse(remoteYearsRaw);
      remoteYears.forEach(year => {
        [`mediatracker_${year}_v1`, `trackerino_tareas_${year}_v1`].forEach(k => {
          if (!keysToSync.includes(k)) keysToSync.push(k);
        });
      });
      if (!keysToSync.includes('trackerino_years_v1'))    keysToSync.push('trackerino_years_v1');
      if (!keysToSync.includes('trackerino_active_year')) keysToSync.push('trackerino_active_year');
    } catch (_) {}
  }

  // Pull each key from Firestore; push to Firestore if only local exists
  let pulledNew = false;
  await Promise.all(keysToSync.map(async key => {
    const remoteVal = await firestoreGet(key);
    if (remoteVal !== null) {
      const localVal = _origGet.call(localStorage, key);
      if (localVal !== remoteVal) {
        // Remote differs from local — remote wins (most recently updated device)
        _origSet.call(localStorage, key, remoteVal);
        pulledNew = true;
      }
    } else {
      // Key only exists locally — push it to Firestore
      const localVal = _origGet.call(localStorage, key);
      if (localVal !== null) await firestoreSet(key, localVal);
    }
  }));

  // Mark this session as synced — prevents the reload loop
  sessionStorage.setItem(syncedKey, '1');
  syncEnabled = true;

  if (pulledNew) {
    // There were remote changes — reload once to render fresh data
    showFbToast('Datos actualizados desde la nube, recargando…', 'success');
    setTimeout(() => window.location.reload(), 1000);
  } else {
    showFbToast('Sincronizado ✓', 'success');
  }
}

// ── AUTH STATE LISTENER ───────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  // Don't enable sync writes until pull completes
  syncEnabled = false;
  renderAuthBar(user);

  if (user) {
    await pullAllFromFirestore();
  }
});

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

// Expose for console debugging
window._fbAuth = auth;
