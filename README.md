# Truth Map · AI Teacher

A live dashboard that shows where AI Teacher learners are, country by country and county by county, and where along the way they drop out (registered → logged in → enrolled → completed).

It opens on a world map. Click a country to see its Truth Map: bubble map, geo map, funnel, courses, dropout risk, interventions, assessment and ontology tabs.

## What's in this repo

| Path | What it is |
| --- | --- |
| `truth-map-world.html` | The dashboard: one self-contained page |
| `cdn/truth-map.js` | Build of the dashboard for **jsDelivr + Webflow**. Served from this repo |
| `scripts/` | Build tools (config, CDN build, hand-off package) |
| `HOSTING.md` | Step-by-step guide to hosting it in Webflow |
| `assets/` | Logo |
| `src/`, `test/` | NestJS API (an earlier data service, not used by the dashboard today) |

**No secrets are stored here.** The API key, admin PIN and data address live in `.env` (git-ignored). They reach the dashboard through a generated config file or the Webflow embed snippet, and neither of those is committed.

## Use it on a Webflow page

```html
<div id="truth-map" data-height="100vh" data-min-height="720px"></div>
<script>window.TRUTH_MAP_CONFIG = { /* apiBase, apiKey, … from npm run dashboard:cdn */ };</script>
<script src="https://cdn.jsdelivr.net/gh/sami-OI/truth-map@v1.0.0/cdn/truth-map.js" data-target="#truth-map"></script>
```

Don't hand-write that config. Run `npm run dashboard:cdn` and paste the generated `handoff/webflow-embed.html`. Full steps are in [HOSTING.md](HOSTING.md).

## Develop locally

```bash
npm install
cp .env.example .env        # then fill in DASHBOARD_API_BASE, DASHBOARD_API_KEY, …
npm run dashboard:config    # writes truth-map-config.js from .env
open truth-map-world.html   # or double-click it
```

## Commands

| Command | Does |
| --- | --- |
| `npm run dashboard:config` | Writes `truth-map-config.js` (local use) from `.env` |
| `npm run dashboard:cdn` | Builds `cdn/truth-map.js` + `handoff/webflow-embed.html` for Webflow |
| `npm run dashboard:package` | Zips `index.html` + config + guide into `handoff/truth-map.zip` for static hosting |

## Releasing a new version

1. Change the code, then bump `DASHBOARD_CDN_VERSION` in `.env` (e.g. `v1.0.1`).
2. Run `npm run dashboard:cdn`.
3. Commit `cdn/truth-map.js`, then tag the release and push it:

   ```bash
   git tag v1.0.1
   git push origin main --tags
   ```

4. In Webflow, re-paste `handoff/webflow-embed.html` (only the version changes) and publish.

Use version tags, never `@main`: jsDelivr caches branches for a long time.

## Settings (`.env`)

| Variable | Meaning |
| --- | --- |
| `DASHBOARD_API_BASE` | Address of the data service |
| `DASHBOARD_API_KEY`, `DASHBOARD_API_KEY_HEADER` | Access key and the header it's sent in |
| `DASHBOARD_DATA_MODE` | `live`, `auto` (sample data if unreachable) or `sample` |
| `DASHBOARD_DEFAULT_COURSE` | Course opened first in every country |
| `DASHBOARD_ADMIN_PIN` | PIN for the Admin button (hide / show tabs, charts, numbers) |
| `DASHBOARD_HIDDEN` | Items hidden for everyone (made in Admin → Save for everyone) |
| `DASHBOARD_ASSESSMENT_API_BASE` | Only if assessment scores come from a different server |
| `DASHBOARD_CDN_REPO`, `DASHBOARD_CDN_VERSION` | Repo and release tag the Webflow embed loads |

## Security notes

- Anything the browser receives, including the API key in the Webflow snippet, can be read by visitors. For a public page, have the backend add the key server-side.
- Restrict the API's CORS to your Webflow domains.
- The admin PIN deters casual users only. It is not access control.
