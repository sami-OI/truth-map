# Hide the API key: Cloudflare Worker proxy

Anything a web page uses can be read by its visitors, so the API key can't be hidden *in* the Webflow snippet. This proxy keeps the key on Cloudflare instead:

```
Webflow page ──(no key)──► Worker ──(adds the key)──► data API
```

| | Without proxy | With proxy |
| --- | --- | --- |
| API key in the page | Yes, readable by visitors | **No** |
| Other websites can use your API | Yes (CORS `*`) | **No**, only `ALLOWED_ORIGINS` |
| Slow endpoints (Kenya course breakdown ~15 s) | Slow for every new visitor | Cached at the edge for 5 min, fast for everyone after the first |
| Cost | — | Free plan: 100,000 requests/day |

## Set it up (about 15 minutes)

### 1. Create the Worker

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com) (a free account is fine).
2. Go to **Workers & Pages → Create → Create Worker**, name it `truth-map-proxy`, and click **Deploy**.
3. Click **Edit code**, delete the sample, paste the whole of `proxy/cloudflare-worker.js`, then click **Deploy**.

### 2. Add its settings

Open **Settings → Variables and Secrets → Add**:

| Name | Type | Value |
| --- | --- | --- |
| `API_KEY` | **Secret** | the data API key (use a **new, rotated** key) |
| `UPSTREAM_BASE` | Text | the data API's origin only, e.g. `https://your-api-host` (no `/api/…` path) |
| `ALLOWED_ORIGINS` | Text | your Webflow domains, comma-separated, e.g. `https://your-site.com,https://your-site.webflow.io` |
| `API_KEY_HEADER` | Text | optional, default `api-key` |
| `CACHE_SECONDS` | Text | optional, default `300` |

Click **Deploy** again. Your Worker address looks like `https://truth-map-proxy.<your-account>.workers.dev`. You can also add a custom domain such as `truth-map-api.your-site.com` under **Settings → Domains & Routes**.

### 3. Point the dashboard at the proxy

In `.env`:

```
DASHBOARD_API_BASE=https://truth-map-proxy.<your-account>.workers.dev/api/v1/truth-map
DASHBOARD_API_KEY=
```

Leave the key **empty**: the dashboard then sends no key, and the Worker adds it. Then:

```bash
npm run dashboard:cdn
```

Paste the new `handoff/webflow-embed.html` into the Webflow Code Embed and publish. No GitHub release is needed, because only settings changed.

### 4. Retire the old key

1. Ask the backend team to **rotate** the API key. The old one has been in the snippet and in chat.
2. Put the **new** key only in the Worker's `API_KEY` secret.
3. Optionally ask them to accept requests only from Cloudflare, and change the API's CORS from `*` to nothing (only the Worker calls it now).

## Check it

- Open the published Webflow page: the dashboard should show **● LIVE**.
- View the page source and search for the old key: it should not be there.
- Open the Worker URL + `/api/v1/truth-map/countries` directly in a browser tab: it answers **403 Origin not allowed**. That's correct, because it only serves your Webflow pages.

## Testing the dashboard locally

A page opened from a file (`file://`) sends the origin `null`. To test locally through the proxy, temporarily add `null` to `ALLOWED_ORIGINS`, and remove it again afterwards.

## Signing in

Sign-ins and signed-in requests pass through the Worker without being cached, because the cache is shared by everyone. Deploy this Worker version before releasing a dashboard version that has **Sign in**, or sign-in will fail with a CORS error.

## Limits worth knowing

- The origin check stops **other websites** from using the proxy. A determined person writing their own script can still fake an origin and read the same **aggregate** numbers the dashboard shows. They never get the key, and can only call these five read-only endpoints. If the numbers themselves must be private, put the page behind a login (Webflow page password or Memberships) and have the Worker check that login too.
- The admin PIN is a separate matter. It only hides parts of the screen, it doesn't protect data.
