# Farmhouse Brew — Website & Admin Dashboard

A static site plus Firebase backend for Farmhouse Brew, a drive-up espresso stand in Black Diamond, WA.

**Status: demo mode.** Every public page carries `noindex, nofollow` and `robots.txt` disallows the whole site until the owner reviews and approves it — see [Going live](#going-live).

---

## File structure

```
index.html            Public one-page site (hero, menu, hours, location, about, contact)
privacy.html           Privacy policy
admin.html              Admin dashboard (owner-only, always noindex)
css/style.css           All styles. Version the ?v= query string when you edit this file.
js/utils.js              Shared helpers (HTML escaping, day/category ordering)
js/firebase-config.js     Firebase project config — placeholders until setup is done
js/main.js                Public site logic (loads menu/hours/banner, submits contact form)
js/admin.js                Admin dashboard logic (login, three-outcome access check, CRUD)
firebase/firestore.rules    Security rules — placeholder admin email, safe to commit
assets/favicon.svg           Text-mark favicon (swap for the real logo once received)
robots.txt, sitemap.xml       SEO plumbing, demo-mode marked
CHECKLIST.md                   Reusable per-client setup checklist
```

No build step. Open `index.html` in a browser, or serve the folder with any static file server — nothing to compile.

---

## Data model

| Collection | Purpose | Public | Admin |
|---|---|---|---|
| `menu` | Menu items (name, description, price, category, order, active) | Read (active items only) | Create, edit, delete |
| `site/hours` | Weekly schedule + holiday/seasonal override | Read | Write |
| `site/banner` | Site-wide announcement/closure banner | Read | Write |
| `inquiries` | Contact form submissions | Create only | Read, update (status), delete |
| `adminEmails` | Allowlist of additional admin emails (doc ID = email) | — | Read/write (admin only) |
| `adminProfile` | Existence-ping used by the dashboard's access check | — | Get (own uid only, admin only) |

### Field tables

**`menu/{itemId}`**
| Field | Type | Required | Max length | Who writes |
|---|---|---|---|---|
| name | string | yes | 60 | admin |
| description | string | no | 160 | admin |
| price | string | yes | 20 | admin |
| category | string | yes | — | admin |
| order | number | yes | — | admin |
| active | boolean | yes | — | admin |
| photo | string (data URL) | no | < 700,000 chars | admin |

`photo` is optional — items with none simply render without a thumbnail. Firebase Storage is off-limits on the Spark plan, so the admin dashboard compresses any uploaded photo in the browser (max ~1000px edge, JPEG) before storing it inline; the rules cap enforces the same limit server-side as a backstop.

**`site/hours`**
| Field | Type | Required | Who writes |
|---|---|---|---|
| schedule | map (mon–sun → `{open, close, closed}`) | yes | admin |
| overrideActive | boolean | yes | admin |
| overrideMessage | string (max 200) | no | admin |

**`site/banner`**
| Field | Type | Required | Who writes |
|---|---|---|---|
| active | boolean | yes | admin |
| message | string (max 200) | no | admin |

**`inquiries/{inquiryId}`**
| Field | Type | Required | Max length | Who writes |
|---|---|---|---|---|
| name | string | yes | 80 | public (create) |
| email | string | yes | 120 | public (create) |
| phone | string | no | 30 | public (create) |
| message | string | yes | 1000 | public (create) |
| status | string, must be `'new'` on create | yes | — | public (create), admin (update) |
| createdAt | timestamp, must equal `request.time` | yes | — | public (create) |

The `inquiries` create rule uses `keys().hasOnly([...])` so no extra fields can be smuggled onto a public write.

---

## Security model — why it's email-based

Admin access is decided by **email address**, checked two ways, either sufficient:

1. A bootstrap owner email hard-coded in `firestore.rules`. This works even against an empty database, so nobody can ever be fully locked out.
2. A document in `adminEmails` whose **document ID is the email address itself**. This is the everyday way to add or remove an admin — no rules edit, no republish, effective immediately.

**We deliberately never key admin access off the Auth UID.** A UID is 28 random characters that look alike in the Console's font (`l`/`1`/`I`, `O`/`0`), get truncated in the user list, and are regenerated if an account is ever deleted and recreated. A UID-keyed document that's wrong still looks perfectly correct in the Console — there's no error to explain why access failed. Email doesn't have that failure mode.

**The browser never holds a copy of the allowlist.** Anything shipped to the page is public. Instead, the dashboard attempts to read `adminProfile/{uid}` — a document the rules only allow an authorized user to read for their own uid — and interprets the result:

- Read succeeds (even if the document doesn't exist) → **authorized**.
- Read fails with `permission-denied` → **not authorized**.
- Read fails any other way (offline, rules not published, SDK blocked by an extension) → **could not determine** — shown as its own screen with the real error code, never mislabeled as "not authorized."

### Adding or removing an admin

**Add:** Firebase Console → Firestore Database → start collection `adminEmails` (if it doesn't exist) → new document → **set the Document ID to the exact email address** (e.g. `newperson@gmail.com`) → save with any field (or none) → done. No rules edit needed.

**Remove:** delete that document. If you need to remove the bootstrap owner email itself, that requires editing `firestore.rules` and republishing, since it's hard-coded as the fallback.

### Password-only login

The login screen only asks for a password — no email field. Firebase Authentication still requires an account identity behind the scenes, so `js/admin.js` holds one fixed `ADMIN_LOGIN_EMAIL` constant (matching the bootstrap email in `firestore.rules`) that the page signs in with automatically; the owner never sees or types it. Everything else about the security model is unchanged — that hidden email is still what the rules check against `adminEmails` and the bootstrap fallback.

If you ever add a second real admin with their own login, they'll need their own email typed back into a login form — this password-only shortcut only works cleanly for a single shared account. Re-add the email field to `admin.html`'s login form if that need comes up.

### Password recovery

This site does **not** have a self-service "forgot password" flow — for one admin account, that's a page, an error state, and a mail-delivery dependency for a problem the Console solves in two clicks: **Firebase Console → Authentication → Users → find the account → Reset password.**

---

## Replacing photos / the logo

No real logo or photos were available at build time — the header uses a text wordmark and the hero uses an inline illustration, so there's nothing broken to replace.

When a real logo arrives:
1. Trim it to content. If the artwork touches its own frame edge, add a small even margin before squaring it (a circular mark that already touches the edge reads as clipped once squared).
2. Square the canvas — the header slot is fixed-aspect (a circle), so a non-square source will distort.
3. Optimize the file size (PNG with a reduced palette, or SVG) — it loads on every page.
4. Replace the two `<span class="mark-fallback">FB</span>` elements (in `index.html`, `privacy.html`, `admin.html`) with `<img src="assets/logo.png" alt="Farmhouse Brew logo">`.
5. In `css/style.css`, the `.wordmark img` rule already includes `flex-shrink: 0` and `object-fit: cover` — no changes needed there.
6. Also replace `assets/favicon.svg` with a square version of the mark if you want the real logo in the browser tab.

---

## Cache-safe deployment

`css/style.css` is linked with a version query string: `css/style.css?v=1`. **Bump the number every time you edit that file** (`?v=2`, `?v=3`, …) — GitHub Pages and browsers cache CSS aggressively, and shipping new HTML against an old cached stylesheet looks like a broken build when it's really just a caching problem.

---

## Going live

1. Confirm the owner has reviewed and approved the site as-is.
2. Remove `<meta name="robots" content="noindex, nofollow">` from `index.html` and `privacy.html` (**not** `admin.html` — that one stays noindex forever).
3. In `robots.txt`, delete the demo-mode `Disallow: /` line (keep the `Disallow: /admin.html` line).
4. If a real domain has been purchased and its DNS has been verified (see below), update the canonical/OpenGraph/sitemap URLs and add a `CNAME` file.
5. Double-check GitHub Pages' publishing source branch **and** the repository's default branch both point at this branch — they're separate settings and can silently disagree.

### If a custom domain is added later

- **Never add a `CNAME` file until you've verified the domain's DNS actually resolves** to GitHub's four Pages IPs (`185.199.108.153`, `.109.153`, `.110.153`, `.111.153`). A `CNAME` file makes GitHub Pages treat that domain as authoritative and can redirect the working `github.io` URL to a domain that isn't ready yet — taking the working site offline in the meantime.
- Add the domain under **Firebase Console → Authentication → Settings → Authorized domains**, or admin login will fail on the new domain specifically with `auth/unauthorized-domain` (public pages will work fine — only login breaks).

---

## Firebase Setup Pack

Follow these in order with the [Firebase Console](https://console.firebase.google.com/) open.

### 1. Console steps

1. **Create project** — Firebase Console → Add project → name it (e.g. "Farmhouse Brew") → disable Google Analytics (not needed) → Create.
2. **Firestore** — Build → Firestore Database → Create database → **production mode** → choose a location close to Washington State (e.g. `us-west1`) → Enable.
3. **Email/Password sign-in** — Build → Authentication → Get started → Sign-in method tab → enable **Email/Password** → Save.
4. **Create the owner's user** — Authentication → Users tab → Add user → enter the `ADMIN_LOGIN_EMAIL` value from `js/admin.js` (not the owner's personal email — the login screen is password-only, this address never appears in the UI) and a password you set → Add user.
5. **Publish rules** — Firestore Database → Rules tab → paste in the rules with the **real** owner email (see below, provided separately in chat — never commit the real email) → Publish.
6. **Register the web app** — Project Settings (gear icon) → General tab → scroll to "Your apps" → click the `</>` web icon → nickname it → **do not** check "Firebase Hosting" → Register app → copy the `firebaseConfig` object shown.
7. **Authorized domains** — Authentication → Settings tab → Authorized domains → confirm `localhost` and the `*.github.io` domain are listed (GitHub Pages domains are added automatically once you visit the admin page from that URL the first time; add manually here if login fails).

### 2. Rules — repo copy vs. real copy

The version committed in `firebase/firestore.rules` uses `owner@example.com` as a placeholder. **The version with the real owner email is provided separately in chat, never committed** — paste that one into the Console's Rules tab in step 5 above.

### 3. `firebaseConfig` values

Paste the object the Console gave you in step 6 into `js/firebase-config.js`, replacing the placeholders:

```js
export const firebaseConfig = {
  apiKey: "...",              // Console → Project Settings → General → Web app config
  authDomain: "....firebaseapp.com",
  projectId: "...",
  storageBucket: "....appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

These values are not secret — they identify the project, not grant access. Access is controlled entirely by `firestore.rules`.

### 4. Verify each capability

| Capability | How to verify |
|---|---|
| Menu | Log into `admin.html`, add an item under the Menu tab (try one with a photo), then reload `index.html` and confirm it appears under the right category with its thumbnail. |
| Hours | Set the weekly schedule in the Hours tab, save, reload `index.html`, confirm the table matches. Toggle the override on with a message and confirm it appears above the hours table. |
| Banner | Turn the banner on with a message in the Banner tab, reload any public page, confirm it shows at the top. Turn it off and confirm it disappears. |
| Contact form | Submit the form on `index.html` with a real-looking name/email/message, then check the Inquiries tab in the dashboard for it. |

### 5. Failure table

| Symptom | Real cause | Fix |
|---|---|---|
| Login shows `auth/unauthorized-domain` | The URL you're loading `admin.html` from isn't in Firebase's authorized domains list | Authentication → Settings → Authorized domains → add it |
| Login shows `auth/invalid-credential` | Email/password typed wrong, or the user doesn't exist yet | Double-check for typos; if the account is missing, create it under Authentication → Users |
| Dashboard shows "Not authorized" with the correct email visible | That email isn't the bootstrap owner and has no `adminEmails` document | Add a document to `adminEmails` with that exact email as the Document ID |
| Dashboard shows "Couldn't check access" (not "Not authorized") | Rules not published yet, Firestore unreachable, or a browser extension blocked the Firebase SDK | Check the error code shown on screen; confirm rules are published; try without ad blockers |
| Dashboard loads, but saving a tab fails | Usually a rules-publish issue, or the field being saved doesn't match what the rules expect | Check the error toast's code; confirm `firestore.rules` was actually published (not just saved as a draft) |

---

## Accessibility

- Every image has `alt` text; `<html lang="en">` is set on every page.
- Every form input has an associated `<label>`.
- A skip-to-content link is the first focusable element on every public and admin page.
- `:focus-visible` outlines are styled (3px mustard outline) and `prefers-reduced-motion` is honored (disables smooth scroll and hover-lift transitions).
- Contrast ratios (WCAG AA requires 4.5:1 for body text, 3:1 for large/bold text):
  - Espresso text on cream background: **12.68:1**
  - Forest text/links on cream: **8.16:1**
  - White button text on forest: **8.79:1**
  - Cream text on espresso (footer): **12.68:1**
  - Espresso text on mustard (badges, bold/large use only): **4.65:1**
- All interactive elements are reachable and operable by keyboard alone (tested via Tab/Shift+Tab/Enter through nav, menu, form, and dashboard tabs).

---

## Privacy Policy

`privacy.html` states exactly what the contact form collects, what isn't collected (no analytics, no accounts, no mailing list), names the third-party embeds that actually load (Google Fonts, Google Maps, Firebase), and gives a real path to request data removal. It's linked from every page footer and referenced near the contact form's submit button.
