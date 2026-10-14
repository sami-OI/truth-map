// Builds the jsDelivr / Webflow version of the dashboard.
//
//   npm run dashboard:cdn
//
// Writes:
//   cdn/truth-map.js            → upload to the PUBLIC GitHub repo (no key, no PIN inside)
//   cdn/README.md               → readme for that repo
//   handoff/webflow-embed.html  → paste into a Webflow Code Embed (contains the key: never commit it)
//
// How it works: truth-map.js carries the whole dashboard page as a string. On the
// Webflow page it finds its container, adds the settings from window.TRUTH_MAP_CONFIG,
// and shows the page in an iframe (a blob: URL, same origin as the Webflow page), so
// Webflow's CSS and the dashboard's CSS can't affect each other.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const env = (k, d = '') => (process.env[k] || '').trim() || d;

const REPO = env('DASHBOARD_CDN_REPO', 'YOUR-GITHUB-ORG/truth-map-dashboard');
const VERSION = env('DASHBOARD_CDN_VERSION', 'v1.0.0');
// path of the built file inside the repo (this project commits it at cdn/truth-map.js)
const FILE = env('DASHBOARD_CDN_PATH', 'cdn/truth-map.js').replace(/^\/+/, '');
const CDN_URL = `https://cdn.jsdelivr.net/gh/${REPO}@${VERSION}/${FILE}`;

// 1. the dashboard page, with the config <script src> swapped for a placeholder
let html = fs.readFileSync(path.join(root, 'truth-map-world.html'), 'utf8');
const tag = '<script src="truth-map-config.js"></script>';
if (!html.includes(tag)) throw new Error('config <script> tag not found in truth-map-world.html');
html = html.replace(tag, '<!--TRUTH_MAP_CONFIG-->');
for (const secret of [env('DASHBOARD_API_KEY'), env('DASHBOARD_ADMIN_PIN')].filter(s => s.length >= 4)) {
  if (html.includes(secret)) throw new Error('refusing to build: a secret from .env appears in truth-map-world.html');
}

// 2. the loader
const loader = `/*! Truth Map dashboard ${VERSION} · loads into a Webflow Code Embed. Settings come from window.TRUTH_MAP_CONFIG on the host page. */
(function () {
  var PAGE = ${JSON.stringify(html)};
  var me = document.currentScript;
  var sel = (me && me.getAttribute('data-target')) || '#truth-map';
  function mount() {
    var box = document.querySelector(sel);
    if (!box) { box = document.createElement('div'); box.id = 'truth-map'; (me && me.parentNode ? me.parentNode : document.body).appendChild(box); }
    if (box.getAttribute('data-truth-map') === 'on') return;            // already mounted
    box.setAttribute('data-truth-map', 'on');
    var cfg = window.TRUTH_MAP_CONFIG || {};
    // settings go into the iframe's page; "<" is escaped so no value can close the script tag
    var cfgTag = '<scr' + 'ipt>window.TRUTH_MAP_CONFIG=' + JSON.stringify(cfg).replace(/</g, '\\\\u003c') + ';</scr' + 'ipt>';
    var url = URL.createObjectURL(new Blob([PAGE.replace('<!--TRUTH_MAP_CONFIG-->', cfgTag)], { type: 'text/html' }));
    // a deep link on the Webflow page (…/truth-map#/country/Kenya/geo) opens that view
    var deep = /^#\\/country\\//.test(location.hash) ? location.hash : '';
    var f = document.createElement('iframe');
    f.src = url + deep;
    f.title = 'Truth Map';
    f.setAttribute('allow', 'clipboard-write; fullscreen');
    f.style.cssText = 'display:block;width:100%;height:100%;min-height:' + (box.getAttribute('data-min-height') || '720px') + ';border:0;';
    if (!box.style.height) box.style.height = box.getAttribute('data-height') || '100vh';
    box.appendChild(f);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
`;

const cdn = path.join(root, 'cdn');
fs.mkdirSync(cdn, { recursive: true });
fs.writeFileSync(path.join(cdn, 'truth-map.js'), loader);
fs.writeFileSync(path.join(cdn, 'README.md'), `# Truth Map dashboard

Static build of the AI Teacher Truth Map, served through jsDelivr and embedded in Webflow.

\`\`\`html
<script src="https://cdn.jsdelivr.net/gh/${REPO}@<version>/${FILE}" data-target="#truth-map"></script>
\`\`\`

This repo holds **no API key or PIN**. Settings are set on the Webflow page via \`window.TRUTH_MAP_CONFIG\`.
Built with \`npm run dashboard:cdn\` in the truth-map-api project. Each release is a git tag (v1.0.0, v1.0.1, …).
`);

// 3. the Webflow embed snippet, settings filled in from truth-map-config.js
global.window = {};
eval(fs.readFileSync(path.join(root, 'truth-map-config.js'), 'utf8'));
const cfg = global.window.TRUTH_MAP_CONFIG || {};
const snippet = `<div id="truth-map" data-height="100vh" data-min-height="720px"></div>
<script>window.TRUTH_MAP_CONFIG=${JSON.stringify(cfg)};</script>
<script src="${CDN_URL}" data-target="#truth-map"></script>
`;
const handoff = path.join(root, 'handoff');
fs.mkdirSync(handoff, { recursive: true });
fs.writeFileSync(path.join(handoff, 'webflow-embed.html'), snippet);

const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log(`✓ cdn/truth-map.js (${kb(loader.length)}) → commit to github.com/${REPO}, tag ${VERSION}, served at ${CDN_URL}`);
console.log(`✓ handoff/webflow-embed.html (${snippet.length} characters, Webflow limit 50,000) → paste into a Code Embed`);
if (REPO.startsWith('YOUR-')) console.log('⚠ Set DASHBOARD_CDN_REPO=<org>/<repo> in .env, then run again so the snippet points at your repo.');
console.log('⚠ webflow-embed.html contains the API key and PIN: never commit it to GitHub.');
