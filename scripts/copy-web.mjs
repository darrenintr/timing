import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('www', { recursive: true, force: true });
mkdirSync('www/src/fonts', { recursive: true });
mkdirSync('www/src/vendor', { recursive: true });
for (const name of ['index.html', 'icon.svg', 'icon-maskable.svg', 'icon-monochrome.svg', 'manifest.webmanifest', 'sw.js']) cpSync(name, `www/${name}`);
for (const name of ['main.js', 'schedule.js', 'homework.js', 'sync-model.js', 'sync.js', 'firebase-config.js', 'vendor/firebase.js', 'calendar-export.js', 'icons.js', 'shapes.js', 'style.css', 'fonts/roboto-flex.woff2', 'fonts/fraunces.woff2', 'fonts/fraunces-italic.woff2', 'fonts/jetbrains-mono.woff2', 'fonts/OFL.txt', 'fonts/OFL-Fraunces.txt', 'fonts/OFL-JetBrainsMono.txt']) cpSync(`src/${name}`, `www/src/${name}`);
console.log('Copied application assets into www/');
