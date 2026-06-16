# Deploying Business Deal to GitHub Pages

The game is 100% static files, so GitHub Pages serves it as-is. A local git repo
has already been initialized and committed for you — you just need a remote.

## 1. Create the GitHub repo

On github.com, create a new **empty** repository named `business-deal`
(no README/license — this repo already has them).

## 2. Push

From the project folder:

```bash
git remote add origin https://github.com/<your-username>/business-deal.git
git branch -M main
git push -u origin main
```

## 3. Enable Pages

Repo **Settings → Pages → Build and deployment**:
- **Source:** Deploy from a branch
- **Branch:** `main`, folder `/ (root)` → **Save**

After a minute the game is live at:

```
https://<your-username>.github.io/business-deal/
```

Paths in `index.html`, `manifest.json`, and `sw.js` are all **relative**, so it
works correctly from the `/business-deal/` subpath.

## 4. Install on your phone

- **iPhone (Safari):** open the URL → Share → **Add to Home Screen**.
- **Android (Chrome):** open the URL → menu → **Add to Home Screen / Install app**.

It then launches full-screen and plays offline.

## Updating later

After changing any asset, bump the cache name in `sw.js`
(`const CACHE = 'business-deal-vN'`) so installed clients pick up the new files,
then commit and push.

---

**Note:** the reference screenshots (`WhatsApp Image *.jpeg`) and the rules PDF
are git-ignored, so they are not published with the game.
