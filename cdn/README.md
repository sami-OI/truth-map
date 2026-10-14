# Truth Map dashboard

Static build of the AI Teacher Truth Map, served through jsDelivr and embedded in Webflow.

```html
<script src="https://cdn.jsdelivr.net/gh/sami-OI/truth-map@<version>/cdn/truth-map.js" data-target="#truth-map"></script>
```

This repo holds **no API key or PIN**. Settings are set on the Webflow page via `window.TRUTH_MAP_CONFIG`.
Built with `npm run dashboard:cdn` in the truth-map-api project. Each release is a git tag (v1.0.0, v1.0.1, …).
