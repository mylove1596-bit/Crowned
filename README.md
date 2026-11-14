# Crowned — legal & support pages

This repository hosts the legal and support pages for **Crowned**, the daily logic puzzle for iPhone.

| Page | File | Where it is used |
|---|---|---|
| Landing | `index.html` | General entry point |
| Shared puzzle landing | `play.html` | Target of every "same puzzle" share link (`play?seed=…&size=…`) |
| Privacy Policy | `privacy.html` | Paywall footer + **App Store Connect → Privacy Policy URL** |
| Terms of Use | `terms.html` | Paywall footer |
| EULA | `eula.html` | Licence reference |
| Support | `support.html` | In-app "Support" link + FAQ |

## Universal Links

`/.well-known/apple-app-site-association` maps `/Crowned/play*` to the app
(`5A69A9H2K9.com.mylove1596.crowned`). It only takes effect once the app is
published on the App Store and the entitlement is live on the App ID.

Until then the `crowned://play?seed=…&size=…` custom scheme is the working
fallback — `play.html` offers it as an "Open this puzzle in Crowned" button.

## `crowned-generator.js` — the puzzle generator, ported to JavaScript

`play.html` renders the **actual board** the sender played, so the page needs
the same level generator the app uses. `crowned-generator.js` is a faithful
port of the app's `PuzzleGenerator` (SplitMix64 → crown placement → region
growth → unique-solution check).

Both sides must produce byte-identical boards for the same `seed` + `size`,
otherwise the page shows a different puzzle than the app opens — and nothing
would throw, it would just quietly break the share link.

The port is verified against the Swift original:

```bash
bash Tools/verify_web_generator.sh   # 2284 boards + hashes, compared line by line
```

The script lives in the app repository (`Tools/verify_web_generator.sh`), not
here — this repository only ships the JavaScript it produces.

## Live site

<https://mylove1596-bit.github.io/Crowned/>

## Editing

Edit the HTML files directly and push to `main` — GitHub Actions redeploys the site automatically.

The pages are plain HTML with one shared stylesheet (`style.css`) plus
`crowned-generator.js`. Keep the structure consistent with the sibling
`spill-privacy` repository.

## Before publishing

- [x] Contact address unified to `mylove1596@gamail.com` (support / legal / privacy all point to it).
- [x] "Last updated" date bumped on the pages that changed (privacy / terms / eula → 10 November 2026).
- [x] Copy matches the app's actual behaviour: the daily puzzle rolls over at 00:00 in the **device's current time zone**, and two crowns may not touch at all (orthogonally or diagonally).
- [ ] Replace the App Store search link in `index.html` and `play.html` with the real listing URL (`https://apps.apple.com/app/id6832871902`) once the app is approved.
- [ ] Update the App Store listing URL if the site address changes.

## Contact

Published by an independent developer. Not affiliated with Apple, Inc.
