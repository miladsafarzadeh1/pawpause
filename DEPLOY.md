# Deploying pawpause.io

The marketing site + live demo lives in `docs/index.html` — a single self-contained
file (no build step, dependency-free vanilla-JS demo). Two ways to ship it.

## 0. One edit before you deploy

Open `docs/index.html`, find this line near the top of the `<script>` and set it
to your real repo:

```js
const GH = "https://github.com/your-org/pawpause";
```

Every GitHub button/link on the page reads from that constant.

## Option A — GitHub Pages (simplest, free, matches "downloads on GitHub")

1. Push this repo to GitHub.
2. Repo → **Settings → Pages**.
3. **Source:** Deploy from a branch → branch `main`, folder **`/docs`**.
4. Save. Pages publishes `docs/index.html`.
5. The `docs/CNAME` file (already contains `pawpause.io`) tells Pages to serve
   the custom domain.

### Point the domain at GitHub Pages

At your DNS provider for `pawpause.io`:

- Apex (`pawpause.io`) → four A records:
  `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- `www` → CNAME → `your-org.github.io`

Then in **Settings → Pages → Custom domain**, enter `pawpause.io` and tick
**Enforce HTTPS** once the cert provisions (can take ~minutes to an hour).

## Option B — Vercel / Netlify / Cloudflare Pages

1. Import the GitHub repo.
2. Framework preset: **None / Other**. Build command: *(none)*.
   Output/publish directory: **`docs`**.
3. Add custom domain `pawpause.io` in the host's dashboard and follow their DNS
   instructions (usually a CNAME to their edge, or A records they provide).

## Downloads = GitHub only

The site never serves library files itself — all "get it" paths go to GitHub:

- **Source:** the repo root (the `src/` library + docs).
- **Releases:** tag a version (`git tag v0.1.0 && git push --tags`) and create a
  GitHub Release; the page's footer links to `/releases`.
- **npm (optional):** `npm publish` from the repo root if you also want
  `npm install pawpause` to work. Remove the npm footer link if you don't.

## Local preview

```bash
cd docs && python3 -m http.server 8080   # then open http://localhost:8080
```
