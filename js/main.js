// Farmhouse Brew — public site logic.
//
// The Firebase SDK is imported lazily (only once the page has loaded, and
// wrapped in try/catch) so a blocked CDN, an ad blocker, or an unconfigured
// project degrades to the static fallback content already in the HTML —
// never a blank page.

import { firebaseConfig } from './firebase-config.js';
import { CATEGORY_ORDER, DAY_LABELS, escapeHtml, formatTime } from './utils.js';

let dbPromise = null;
function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js');
      const firestore = await import('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js');
      const app = initializeApp(firebaseConfig);
      const db = firestore.getFirestore(app);
      return { firestore, db };
    })();
  }
  return dbPromise;
}

function renderBanner(data) {
  const el = document.getElementById('banner');
  if (data && data.active && data.message) {
    el.textContent = data.message;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

function renderHoursFallback() {
  const table = document.getElementById('hours-table');
  table.innerHTML = '<tbody><tr><td colspan="2">Hours coming soon — check back shortly.</td></tr></tbody>';
  document.getElementById('hours-override').hidden = true;
}

function renderHours(data) {
  const table = document.getElementById('hours-table');
  const schedule = data && data.schedule;
  if (!schedule) {
    renderHoursFallback();
    return;
  }
  const rows = DAY_LABELS.map(([key, label]) => {
    const day = schedule[key] || {};
    const cell = day.closed
      ? '<td class="hours-time hours-closed">Closed</td>'
      : `<td class="hours-time">${escapeHtml(formatTime(day.open))}&ndash;${escapeHtml(formatTime(day.close))}</td>`;
    return `<tr><td class="hours-day">${escapeHtml(label)}</td>${cell}</tr>`;
  }).join('');
  table.innerHTML = `<tbody>${rows}</tbody>`;

  const overrideEl = document.getElementById('hours-override');
  if (data.overrideActive && data.overrideMessage) {
    overrideEl.textContent = data.overrideMessage;
    overrideEl.hidden = false;
  } else {
    overrideEl.hidden = true;
  }
}

function renderMenu(items) {
  const container = document.getElementById('menu-content');
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="empty-state">Our menu is being brewed — check back shortly, or ask at the window.</div>';
    return;
  }

  const groups = new Map();
  items.forEach((item) => {
    const cat = item.category || 'Menu';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(item);
  });

  const orderedCategories = [
    ...CATEGORY_ORDER.filter((c) => groups.has(c)),
    ...[...groups.keys()].filter((c) => !CATEGORY_ORDER.includes(c))
  ];

  let html = '<div class="menu-groups">';
  orderedCategories.forEach((category) => {
    const groupItems = groups.get(category).sort((a, b) => (a.order || 0) - (b.order || 0));
    html += `<div class="menu-group"><h3>${escapeHtml(category)}</h3><ul class="menu-list">`;
    groupItems.forEach((item) => {
      html += `<li class="menu-item">
        <div class="menu-item-text">
          <div class="menu-item-name">${escapeHtml(item.name || '')}</div>
          ${item.description ? `<div class="menu-item-desc">${escapeHtml(item.description)}</div>` : ''}
        </div>
        <div class="menu-item-price">${escapeHtml(item.price || '')}</div>
      </li>`;
    });
    html += '</ul></div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

async function loadPublicContent() {
  let firestore, db;
  try {
    ({ firestore, db } = await getDb());
  } catch (err) {
    console.warn('Farmhouse Brew: Firebase unavailable, showing default content.', err);
    renderHoursFallback();
    return;
  }

  const { doc, getDoc, collection, query, where, getDocs } = firestore;

  const [bannerResult, hoursResult, menuResult] = await Promise.allSettled([
    getDoc(doc(db, 'site', 'banner')),
    getDoc(doc(db, 'site', 'hours')),
    getDocs(query(collection(db, 'menu'), where('active', '==', true)))
  ]);

  renderBanner(
    bannerResult.status === 'fulfilled' && bannerResult.value.exists()
      ? bannerResult.value.data()
      : null
  );

  if (hoursResult.status === 'fulfilled' && hoursResult.value.exists()) {
    renderHours(hoursResult.value.data());
  } else {
    renderHoursFallback();
  }

  if (menuResult.status === 'fulfilled') {
    const items = [];
    menuResult.value.forEach((d) => items.push(d.data()));
    renderMenu(items);
  }
}

async function handleContactSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const submitBtn = document.getElementById('cf-submit');
  const statusEl = document.getElementById('cf-status');
  statusEl.hidden = true;
  statusEl.className = 'form-status';

  const name = document.getElementById('cf-name').value.trim();
  const email = document.getElementById('cf-email').value.trim();
  const phone = document.getElementById('cf-phone').value.trim();
  const message = document.getElementById('cf-message').value.trim();

  if (!name || !email || !message) {
    statusEl.textContent = 'Please fill in your name, email, and message.';
    statusEl.classList.add('error');
    statusEl.hidden = false;
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';

  try {
    const { firestore, db } = await getDb();
    const { collection, addDoc, serverTimestamp } = firestore;
    const payload = {
      name: name.slice(0, 80),
      email: email.slice(0, 120),
      message: message.slice(0, 1000),
      status: 'new',
      createdAt: serverTimestamp()
    };
    if (phone) payload.phone = phone.slice(0, 30);

    await addDoc(collection(db, 'inquiries'), payload);

    statusEl.textContent = "Thanks — your message is on its way. We'll get back to you soon.";
    statusEl.classList.add('success');
    statusEl.hidden = false;
    form.reset();
  } catch (err) {
    console.error('Farmhouse Brew: contact form submit failed.', err);
    const cause = err && err.code ? err.code : 'a connection problem';
    statusEl.textContent = `Sorry, that didn't go through (${cause}). Please try again in a moment.`;
    statusEl.classList.add('error');
    statusEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send message';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  loadPublicContent();

  const form = document.getElementById('contact-form');
  if (form) form.addEventListener('submit', handleContactSubmit);
});
