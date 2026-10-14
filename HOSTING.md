# Hosting the Truth Map in Webflow (GitHub + jsDelivr)

The dashboard is one JavaScript file served free by jsDelivr from a public GitHub repo. A short Code Embed on a Webflow page loads it and shows the dashboard.

```
GitHub repo (public)  ──►  jsDelivr CDN  ──►  Webflow page Code Embed
cdn/truth-map.js           cdn.jsdelivr.net    handoff/webflow-embed.html
(no key inside)            (fast, cached)      (settings + key live here)
```

| File | Goes to | Contains secrets? |
| --- | --- | --- |
| `cdn/truth-map.js` | Public GitHub repo ([sami-OI/truth-map](https://github.com/sami-OI/truth-map)) | **No**: checked automatically at build time |
| `handoff/webflow-embed.html` | Pasted into a Webflow Code Embed | **Yes**: API key and admin PIN. Never commit it |

Why not paste the dashboard into Webflow directly? It's about 260 KB, and a Code Embed is limited to 50,000 characters. The embed snippet is about 500.

## One-time setup

The repo is **[github.com/sami-OI/truth-map](https://github.com/sami-OI/truth-map)** (public). The built file lives at `cdn/truth-map.js`, and version `v1.0.0` is already tagged.

### 1. Get the project and its settings

```bash
git clone https://github.com/sami-OI/truth-map.git
cd truth-map
npm install
cp .env.example .env    # fill in the real values (ask for them privately)
```

`.env` needs at least `DASHBOARD_API_BASE`, `DASHBOARD_API_KEY`, `DASHBOARD_ADMIN_PIN`, plus:

```
DASHBOARD_CDN_REPO=sami-OI/truth-map
DASHBOARD_CDN_VERSION=v1.0.0
```

### 2. Build the Webflow snippet

```bash
npm run dashboard:cdn
```

This writes `cdn/truth-map.js` (public) and `handoff/webflow-embed.html` (private, holds the key).

### 3. Check the CDN file is live

Open `https://cdn.jsdelivr.net/gh/sami-OI/truth-map@v1.0.0/cdn/truth-map.js`. You should see code starting `/*! Truth Map dashboard v1.0.0`.

### 4. Add it to Webflow

1. In the Webflow Designer, create a page, for example `Truth Map` at `/truth-map`.
2. Add a **Section** and remove its padding, so the dashboard runs full width.
3. Inside it, add a **Code Embed** element (Add panel → Components → Code Embed).
4. Paste the entire contents of `handoff/webflow-embed.html`, then click **Save & Close**.
5. **Publish** the site, to staging (`webflow.io`) first.
6. Open the published page. Scripts don't run inside the Designer canvas, so the dashboard only appears on the published page.

The embed has three parts: a container `div`, the settings (`window.TRUTH_MAP_CONFIG = …`), and the `<script src=…jsdelivr…>` line.

Container options, set on the `div` in the snippet:

| Attribute | Default | Meaning |
| --- | --- | --- |
| `data-height` | `100vh` | Height of the dashboard on the page |
| `data-min-height` | `720px` | Smallest height, so it never gets too cramped |

Links straight to a view work too: `https://your-site.com/truth-map#/country/Kenya/geo`.

## Releasing an update

1. Make the change in the project (or change a setting in `.env`).
2. Bump the version in `.env`, e.g. `DASHBOARD_CDN_VERSION=v1.0.1`.
3. Build, commit, tag and push:

   ```bash
   npm run dashboard:cdn
   git add -A && git commit -m "Dashboard v1.0.1"
   git tag v1.0.1
   git push origin main --tags
   ```

4. Check `https://cdn.jsdelivr.net/gh/sami-OI/truth-map@v1.0.1/cdn/truth-map.js` opens.
5. In Webflow, replace the Code Embed with the new `handoff/webflow-embed.html` (only the version number changes), save and publish.

**Rolling back** means putting the old version number back in the embed and publishing.

Always use version tags (`@v1.0.1`), never `@main`. jsDelivr caches branch versions for a long time, so a change on `main` can take hours or days to show up.

**Changing only a setting** (API key, PIN, default course, hidden items) doesn't need a new GitHub release. Run `npm run dashboard:cdn` and re-paste the snippet into Webflow.

## Before going public

- **Rotate the API key.** It has been passed around during development. Put the new one in `.env`, rebuild, and re-paste the snippet.
- **Restrict CORS.** Ask the backend team to allow only your Webflow domains (e.g. `https://your-site.com`, `https://your-site.webflow.io`) instead of `*`.
- **The key is visible to visitors** in the page source. For a public page, the backend should add the key server-side (a small proxy), so it never reaches the browser.
- **Internal only?** Turn on Webflow page password protection for the Truth Map page.
- **Admin PIN** only deters casual users. Change it at hand-over.

## Checklist

- [ ] `https://cdn.jsdelivr.net/gh/sami-OI/truth-map@<version>/cdn/truth-map.js` opens in the browser
- [ ] Published Webflow page shows the dashboard with a green **● LIVE** badge
- [ ] Clicking Kenya opens *OIAI AI Literacy Skills*, and the Geo Map shows counties over the street map
- [ ] No double scrollbars, and the Webflow nav and footer look normal
- [ ] API key rotated and CORS restricted to the Webflow domains
