# Per-Client Setup Checklist

A reusable checklist for standing up a new business on this same template.
Copy this file into each new client's repo and work through it top to bottom.

## 1. Firebase project
- [ ] Create a **new, dedicated** Firebase project for this client — never reuse another client's project.
- [ ] Firestore Database created in **production mode**.
- [ ] Authentication → Sign-in method → **Email/Password** enabled.
- [ ] Authentication → Users → create the owner's login (their real email + a password you set and hand off securely).
- [ ] Firestore Rules published, with the **real** owner email swapped in for the placeholder.
- [ ] Web app registered in Project Settings → copy the `firebaseConfig` values into `js/firebase-config.js`.

## 2. Content
- [ ] Business name, town, and any real address/hours confirmed with the owner.
- [ ] Placeholder menu/hours/banner content in Firestore replaced with the owner's real information (via the admin dashboard, not by hand-editing the database).
- [ ] Logo received, processed (trimmed, squared, optimized) and wired into the header — see "Replacing photos" in `README.md`.
- [ ] Privacy Policy reviewed against what the site *actually* collects and loads.

## 3. Access
- [ ] Owner's login email confirmed and tested.
- [ ] `adminEmails` collection has an entry (if there's more than one admin) with the email as the document ID.
- [ ] Bootstrap owner email in `firestore.rules` matches the real owner — not `owner@example.com`.

## 4. Domain (only if the client has one)
- [ ] DNS for the domain (and `www` if used) verified to resolve to GitHub's four Pages IPs before adding a `CNAME` file.
- [ ] Domain added under Firebase → Authentication → Settings → Authorized domains.
- [ ] GitHub Pages custom domain configured in repo settings.

## 5. Go-live
- [ ] Owner has reviewed and approved the site as-is.
- [ ] `noindex, nofollow` removed from every public page's `<meta name="robots">` tag (not `admin.html`).
- [ ] Blanket `Disallow: /` removed from `robots.txt` (keep the `admin.html` line).
- [ ] Canonical/OpenGraph/sitemap URLs point at wherever the site is actually reachable.
- [ ] GitHub Pages publishing source branch **and** the repo's default branch both point at the deliverable branch.
- [ ] Final click-through on a real phone: menu, hours, contact form submit, and the admin dashboard login.

## 6. Handoff
- [ ] `README.md` walked through live with the owner, or a recording sent.
- [ ] Real admin email/password delivered to the owner through a private channel — never committed to the repo.
- [ ] Owner knows how to reach you for a Console-based password reset if they ever get locked out.
