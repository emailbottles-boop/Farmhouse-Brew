// Farmhouse Brew — admin dashboard logic.
//
// Admin access is decided by EMAIL (see firebase/firestore.rules), never by
// Auth UID. The dashboard proves authorization by attempting to read
// adminProfile/{uid} — the rules only allow that read for an authorized
// email. Three distinct outcomes are shown, never collapsed into two:
//   - read succeeds (even if the doc doesn't exist)  -> authorized
//   - read fails with "permission-denied"            -> not authorized
//   - read fails any other way (offline, rules not
//     published yet, SDK blocked)                    -> could not determine

import { firebaseConfig } from './firebase-config.js';
import { CATEGORY_ORDER, DAY_LABELS, escapeHtml } from './utils.js';

let fbPromise = null;
function getFirebase() {
  if (!fbPromise) {
    fbPromise = (async () => {
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js');
      const authMod = await import('https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js');
      const firestore = await import('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js');
      const app = initializeApp(firebaseConfig);
      const auth = authMod.getAuth(app);
      const db = firestore.getFirestore(app);
      return { authMod, auth, firestore, db };
    })();
  }
  return fbPromise;
}

// ---------------- Screens ----------------

const screens = {
  auth: document.getElementById('auth-screen'),
  unauthorized: document.getElementById('unauthorized-screen'),
  unknown: document.getElementById('unknown-screen'),
  dashboard: document.getElementById('dashboard')
};

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
}

function describeAuthError(err) {
  const code = err && err.code;
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return "That email and password combination isn't correct (auth/invalid-credential). Double-check for typos, or ask whoever manages Firebase for a Console password reset.";
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts — wait a few minutes and try again (auth/too-many-requests).';
  }
  if (code === 'auth/unauthorized-domain') {
    return "This web address isn't authorized for login (auth/unauthorized-domain). Add it under Firebase Console → Authentication → Settings → Authorized domains.";
  }
  if (code === 'auth/network-request-failed') {
    return 'Could not reach Firebase — check your connection and try again (auth/network-request-failed).';
  }
  return `Login failed: ${code || (err && err.message) || 'unknown error'}.`;
}

async function handleLogin(event) {
  event.preventDefault();
  const statusEl = document.getElementById('auth-status');
  statusEl.hidden = true;
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const submitBtn = document.getElementById('login-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in…';
  try {
    const { authMod, auth } = await getFirebase();
    await authMod.signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    statusEl.textContent = describeAuthError(err);
    statusEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log in';
  }
}

async function handleSignOut() {
  const { authMod, auth } = await getFirebase();
  await authMod.signOut(auth);
}

function wireCopyButton(btnId, sourceId) {
  const btn = document.getElementById(btnId);
  const src = document.getElementById(sourceId);
  if (!btn || !src) return;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(src.textContent);
      const original = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = original; }, 1500);
    } catch {
      // Clipboard API unavailable — the email is still visible to select by hand.
    }
  });
}

let dashboardInitialized = false;

async function checkAdminAccess(user) {
  ['unauth-email', 'unknown-email', 'dash-email'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = user.email;
  });

  try {
    const { firestore, db } = await getFirebase();
    const { doc, getDoc } = firestore;
    await getDoc(doc(db, 'adminProfile', user.uid));
    showScreen('dashboard');
    if (!dashboardInitialized) {
      dashboardInitialized = true;
      initDashboard();
    }
  } catch (err) {
    if (err && err.code === 'permission-denied') {
      showScreen('unauthorized');
    } else {
      document.getElementById('unknown-error').textContent =
        `${err && err.code ? err.code : 'unknown error'}: ${err && err.message ? err.message : 'no further detail available'}`;
      showScreen('unknown');
    }
  }
}

async function initAuthListener() {
  try {
    const { authMod, auth } = await getFirebase();
    authMod.onAuthStateChanged(auth, (user) => {
      if (user) {
        checkAdminAccess(user);
      } else {
        showScreen('auth');
      }
    });
  } catch (err) {
    showScreen('auth');
    const statusEl = document.getElementById('auth-status');
    statusEl.textContent = `Couldn't reach Firebase to check login state (${err && err.message ? err.message : 'connection failed'}). Check your connection and reload — you can still try logging in below.`;
    statusEl.hidden = false;
  }
}

// ---------------- Tabs ----------------

const TABS = ['menu', 'hours', 'banner', 'inquiries'];

function wireTabs() {
  TABS.forEach((name) => {
    document.getElementById(`tab-btn-${name}`).addEventListener('click', () => switchTab(name));
  });
}

function switchTab(active) {
  TABS.forEach((name) => {
    document.getElementById(`tab-btn-${name}`).setAttribute('aria-selected', String(name === active));
    document.getElementById(`tab-${name}`).hidden = name !== active;
  });
}

function showToast(message, isError) {
  const el = document.getElementById('save-toast');
  el.textContent = message;
  el.className = 'status-banner ' + (isError ? 'error' : 'success');
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.hidden = true; }, 3500);
}

function initDashboard() {
  wireTabs();
  wireMenuTab();
  wireHoursTab();
  wireBannerTab();
  wireInquiriesTab();
}

// ---------------- Menu tab ----------------

function categoryOptions(selected) {
  return CATEGORY_ORDER.map((c) =>
    `<option value="${escapeHtml(c)}" ${c === selected ? 'selected' : ''}>${escapeHtml(c)}</option>`
  ).join('');
}

function renderMenuCard(item) {
  const id = escapeHtml(item.id);
  return `<div class="admin-card" data-id="${id}">
    <div class="field"><label>Name</label><input type="text" class="mc-name" maxlength="60" value="${escapeHtml(item.name || '')}"></div>
    <div class="field"><label>Description</label><input type="text" class="mc-desc" maxlength="160" value="${escapeHtml(item.description || '')}"></div>
    <div class="field"><label>Price</label><input type="text" class="mc-price" maxlength="20" value="${escapeHtml(item.price || '')}"></div>
    <div class="field"><label>Category</label><select class="mc-category">${categoryOptions(item.category)}</select></div>
    <div class="field"><label>Sort order <span class="field-hint">(lower shows first)</span></label><input type="number" class="mc-order" value="${Number(item.order) || 0}"></div>
    <div class="field"><label><input type="checkbox" class="mc-active" style="width:auto;display:inline-block;margin-right:0.5rem;" ${item.active !== false ? 'checked' : ''}> Visible on site</label></div>
    <div class="admin-card-actions">
      <button type="button" class="btn btn-sm btn-primary mc-save">Save</button>
      <button type="button" class="btn btn-sm btn-danger mc-delete">Delete</button>
    </div>
  </div>`;
}

function wireMenuCard(id) {
  const card = document.querySelector(`.admin-card[data-id="${CSS.escape(id)}"]`);
  if (!card) return;

  card.querySelector('.mc-save').addEventListener('click', async () => {
    const name = card.querySelector('.mc-name').value.trim();
    const description = card.querySelector('.mc-desc').value.trim();
    const price = card.querySelector('.mc-price').value.trim();
    const category = card.querySelector('.mc-category').value;
    const order = Number(card.querySelector('.mc-order').value) || 0;
    const active = card.querySelector('.mc-active').checked;
    if (!name || !price) { showToast('Name and price are required.', true); return; }
    try {
      const { firestore, db } = await getFirebase();
      const { doc, updateDoc } = firestore;
      await updateDoc(doc(db, 'menu', id), {
        name: name.slice(0, 60),
        description: description.slice(0, 160),
        price: price.slice(0, 20),
        category,
        order,
        active
      });
      showToast('Saved.');
    } catch (err) {
      showToast(`Couldn't save (${err.code || err.message}).`, true);
    }
  });

  card.querySelector('.mc-delete').addEventListener('click', async () => {
    if (!confirm("Delete this menu item? This can't be undone.")) return;
    try {
      const { firestore, db } = await getFirebase();
      const { doc, deleteDoc } = firestore;
      await deleteDoc(doc(db, 'menu', id));
      showToast('Item deleted.');
      loadMenuAdmin();
    } catch (err) {
      showToast(`Couldn't delete (${err.code || err.message}).`, true);
    }
  });
}

async function loadMenuAdmin() {
  const container = document.getElementById('menu-admin-list');
  container.innerHTML = '<p class="helper-text">Loading…</p>';
  try {
    const { firestore, db } = await getFirebase();
    const { collection, getDocs } = firestore;
    const snap = await getDocs(collection(db, 'menu'));
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    if (items.length === 0) {
      container.innerHTML = '<p class="helper-text">No menu items yet — add one above.</p>';
      return;
    }
    items.sort((a, b) =>
      (CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)) || ((a.order || 0) - (b.order || 0))
    );
    container.innerHTML = items.map(renderMenuCard).join('');
    items.forEach((item) => wireMenuCard(item.id));
  } catch (err) {
    container.innerHTML = `<p class="helper-text">Couldn't load the menu (${escapeHtml(err.code || err.message || 'error')}).</p>`;
  }
}

function wireMenuTab() {
  document.getElementById('menu-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('mf-name').value.trim();
    const description = document.getElementById('mf-desc').value.trim();
    const price = document.getElementById('mf-price').value.trim();
    const category = document.getElementById('mf-category').value;
    if (!name || !price) { showToast('Item name and price are required.', true); return; }
    try {
      const { firestore, db } = await getFirebase();
      const { collection, addDoc } = firestore;
      await addDoc(collection(db, 'menu'), {
        name: name.slice(0, 60),
        description: description.slice(0, 160),
        price: price.slice(0, 20),
        category,
        order: Date.now(),
        active: true
      });
      document.getElementById('menu-form').reset();
      showToast('Item added.');
      loadMenuAdmin();
    } catch (err) {
      showToast(`Couldn't add item (${err.code || err.message}).`, true);
    }
  });
  loadMenuAdmin();
}

// ---------------- Hours tab ----------------

function dayRowHtml(key, label, day) {
  const d = day || {};
  return `<div class="day-row" data-day="${key}">
    <label class="day-label">${escapeHtml(label)}</label>
    <input type="time" class="day-open" value="${escapeHtml(d.open || '')}" ${d.closed ? 'disabled' : ''}>
    <input type="time" class="day-close" value="${escapeHtml(d.close || '')}" ${d.closed ? 'disabled' : ''}>
    <label class="day-closed-toggle helper-text"><input type="checkbox" class="day-closed" style="width:auto;display:inline-block;margin-right:0.4rem;" ${d.closed ? 'checked' : ''}> Closed</label>
  </div>`;
}

async function loadHoursAdmin() {
  const editor = document.getElementById('hours-editor');
  editor.innerHTML = '<p class="helper-text">Loading…</p>';
  try {
    const { firestore, db } = await getFirebase();
    const { doc, getDoc } = firestore;
    const snap = await getDoc(doc(db, 'site', 'hours'));
    const data = snap.exists() ? snap.data() : {};
    const schedule = data.schedule || {};
    editor.innerHTML = DAY_LABELS.map(([key, label]) => dayRowHtml(key, label, schedule[key])).join('');
    editor.querySelectorAll('.day-row').forEach((row) => {
      const closedBox = row.querySelector('.day-closed');
      closedBox.addEventListener('change', () => {
        row.querySelector('.day-open').disabled = closedBox.checked;
        row.querySelector('.day-close').disabled = closedBox.checked;
      });
    });
    document.getElementById('hf-override-active').checked = !!data.overrideActive;
    document.getElementById('hf-override-message').value = data.overrideMessage || '';
  } catch (err) {
    editor.innerHTML = `<p class="helper-text">Couldn't load hours (${escapeHtml(err.code || err.message || 'error')}).</p>`;
  }
}

function wireHoursTab() {
  document.getElementById('hours-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const schedule = {};
    document.querySelectorAll('#hours-editor .day-row').forEach((row) => {
      const key = row.dataset.day;
      const closed = row.querySelector('.day-closed').checked;
      schedule[key] = {
        closed,
        open: closed ? '' : row.querySelector('.day-open').value,
        close: closed ? '' : row.querySelector('.day-close').value
      };
    });
    const overrideActive = document.getElementById('hf-override-active').checked;
    const overrideMessage = document.getElementById('hf-override-message').value.trim().slice(0, 200);
    try {
      const { firestore, db } = await getFirebase();
      const { doc, setDoc } = firestore;
      await setDoc(doc(db, 'site', 'hours'), { schedule, overrideActive, overrideMessage });
      showToast('Hours saved.');
    } catch (err) {
      showToast(`Couldn't save hours (${err.code || err.message}).`, true);
    }
  });
  loadHoursAdmin();
}

// ---------------- Banner tab ----------------

async function loadBannerAdmin() {
  try {
    const { firestore, db } = await getFirebase();
    const { doc, getDoc } = firestore;
    const snap = await getDoc(doc(db, 'site', 'banner'));
    const data = snap.exists() ? snap.data() : {};
    document.getElementById('bf-active').checked = !!data.active;
    document.getElementById('bf-message').value = data.message || '';
  } catch (err) {
    showToast(`Couldn't load banner (${err.code || err.message}).`, true);
  }
}

function wireBannerTab() {
  document.getElementById('banner-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const active = document.getElementById('bf-active').checked;
    const message = document.getElementById('bf-message').value.trim().slice(0, 200);
    try {
      const { firestore, db } = await getFirebase();
      const { doc, setDoc } = firestore;
      await setDoc(doc(db, 'site', 'banner'), { active, message });
      showToast('Banner saved.');
    } catch (err) {
      showToast(`Couldn't save banner (${err.code || err.message}).`, true);
    }
  });
  loadBannerAdmin();
}

// ---------------- Inquiries tab ----------------

function statusBadge(status) {
  const cls = status === 'archived' ? 'badge-archived' : status === 'new' || !status ? 'badge-new' : '';
  return `<span class="badge ${cls}">${escapeHtml(status || 'new')}</span>`;
}

function formatTimestamp(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '';
  try {
    return ts.toDate().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

function renderInquiryCard(item) {
  const id = escapeHtml(item.id);
  return `<div class="admin-card" data-id="${id}">
    <div class="admin-card-row">
      <div>
        <strong>${escapeHtml(item.name || '(no name)')}</strong> ${statusBadge(item.status)}
        <div class="helper-text">${escapeHtml(item.email || '')}${item.phone ? ' · ' + escapeHtml(item.phone) : ''}</div>
        <div class="helper-text">${escapeHtml(formatTimestamp(item.createdAt))}</div>
      </div>
    </div>
    <p style="margin-top:0.75rem;white-space:pre-wrap;">${escapeHtml(item.message || '')}</p>
    <div class="admin-card-actions">
      <button type="button" class="btn btn-sm btn-ghost iq-read">Mark read</button>
      <button type="button" class="btn btn-sm btn-ghost iq-archive">Archive</button>
      <button type="button" class="btn btn-sm btn-danger iq-delete">Delete</button>
    </div>
  </div>`;
}

function wireInquiryCard(id) {
  const card = document.querySelector(`.admin-card[data-id="${CSS.escape(id)}"]`);
  if (!card) return;

  const updateStatus = async (status) => {
    try {
      const { firestore, db } = await getFirebase();
      const { doc, updateDoc } = firestore;
      await updateDoc(doc(db, 'inquiries', id), { status });
      loadInquiries();
    } catch (err) {
      showToast(`Couldn't update (${err.code || err.message}).`, true);
    }
  };

  card.querySelector('.iq-read').addEventListener('click', () => updateStatus('read'));
  card.querySelector('.iq-archive').addEventListener('click', () => updateStatus('archived'));
  card.querySelector('.iq-delete').addEventListener('click', async () => {
    if (!confirm("Delete this message? This can't be undone.")) return;
    try {
      const { firestore, db } = await getFirebase();
      const { doc, deleteDoc } = firestore;
      await deleteDoc(doc(db, 'inquiries', id));
      loadInquiries();
    } catch (err) {
      showToast(`Couldn't delete (${err.code || err.message}).`, true);
    }
  });
}

async function loadInquiries() {
  const container = document.getElementById('inquiries-list');
  container.innerHTML = '<p class="helper-text">Loading…</p>';
  try {
    const { firestore, db } = await getFirebase();
    const { collection, getDocs, query, orderBy } = firestore;
    const snap = await getDocs(query(collection(db, 'inquiries'), orderBy('createdAt', 'desc')));
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    if (items.length === 0) {
      container.innerHTML = '<p class="helper-text">No messages yet.</p>';
      return;
    }
    container.innerHTML = items.map(renderInquiryCard).join('');
    items.forEach((item) => wireInquiryCard(item.id));
  } catch (err) {
    container.innerHTML = `<p class="helper-text">Couldn't load messages (${escapeHtml(err.code || err.message || 'error')}).</p>`;
  }
}

function wireInquiriesTab() {
  loadInquiries();
}

// ---------------- Boot ----------------

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('unauth-signout').addEventListener('click', handleSignOut);
  document.getElementById('unknown-signout').addEventListener('click', handleSignOut);
  document.getElementById('dash-signout').addEventListener('click', handleSignOut);
  document.getElementById('unknown-retry').addEventListener('click', async () => {
    const { auth } = await getFirebase();
    if (auth.currentUser) checkAdminAccess(auth.currentUser);
  });
  wireCopyButton('unauth-copy', 'unauth-email');
  wireCopyButton('unknown-copy', 'unknown-email');
  initAuthListener();
});
