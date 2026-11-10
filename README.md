# Crowned — legal & support pages

This repository hosts the legal and support pages for **Crowned**, the daily logic puzzle for iPhone.

| Page | File | Where it is used |
|---|---|---|
| Landing | `index.html` | General entry point |
| Privacy Policy | `privacy.html` | Paywall footer + **App Store Connect → Privacy Policy URL** |
| Terms of Use | `terms.html` | Paywall footer |
| EULA | `eula.html` | Licence reference |
| Support | `support.html` | In-app "Support" link + FAQ |

## Live site

<https://mylove1596-bit.github.io/Crowned/>

## Editing

Edit the HTML files directly and push to `main` — GitHub Actions redeploys the site automatically.

The pages are plain HTML with one shared stylesheet (`style.css`). Keep the structure consistent with the sibling `spill-privacy` repository.

## Before publishing

- [x] Contact address unified to `mylove1596@gamail.com` (support / legal / privacy all point to it).
- [x] "Last updated" date bumped on the pages that changed (privacy / terms / eula → 10 November 2026).
- [x] Copy matches the app's actual behaviour: the daily puzzle rolls over at 00:00 in the **device's current time zone**, and two crowns may not touch at all (orthogonally or diagonally).
- [ ] Replace the placeholder App Store link in `index.html` (`https://apps.apple.com/`) with the real listing URL once the app is approved.
- [ ] Update the App Store listing URL if the site address changes.

## Contact

Published by an independent developer. Not affiliated with Apple, Inc.
