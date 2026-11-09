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

- [ ] Replace the contact addresses `support@crowned.app` / `legal@crowned.app` / `privacy@crowned.app` if the domain is different.
- [ ] Update the "Last updated" date at the top of each page when you change its content.
- [ ] Update the App Store listing URL if the site address changes.

## Contact

Published by an independent developer. Not affiliated with Apple, Inc.
