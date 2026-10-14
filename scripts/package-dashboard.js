// Builds the hand-off package for hosting the dashboard:
//   handoff/truth-map/index.html          ← the dashboard (truth-map-world.html)
//   handoff/truth-map/truth-map-config.js ← API settings (contains the API key)
//   handoff/truth-map/HOSTING.md          ← hosting + Webflow embed steps
//   handoff/truth-map.zip                 ← all of the above, ready to send
//
//   npm run dashboard:package   (regenerates the config from .env first)
//
// handoff/ is git-ignored because the config inside it contains the API key.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const out = path.join(root, 'handoff', 'truth-map');
// only replace this package's own output (keep handoff/webflow-embed.html from dashboard:cdn)
fs.rmSync(out, { recursive: true, force: true });
fs.rmSync(path.join(root, 'handoff', 'truth-map.zip'), { force: true });
fs.mkdirSync(out, { recursive: true });

fs.copyFileSync(path.join(root, 'truth-map-world.html'), path.join(out, 'index.html'));
fs.copyFileSync(path.join(root, 'truth-map-config.js'), path.join(out, 'truth-map-config.js'));
fs.copyFileSync(path.join(root, 'HOSTING.md'), path.join(out, 'HOSTING.md'));

try {
  execFileSync('zip', ['-rq', 'truth-map.zip', 'truth-map'], { cwd: path.join(root, 'handoff') });
  console.log('✓ handoff/truth-map.zip (index.html, truth-map-config.js, HOSTING.md)');
} catch (e) {
  console.log('✓ handoff/truth-map/ ready (zip not available: compress the folder by hand)');
}
console.log('⚠ truth-map-config.js contains the API key and admin PIN: send it privately, not in a public channel.');
