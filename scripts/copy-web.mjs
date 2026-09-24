import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('www', { recursive: true, force: true });
mkdirSync('www/src', { recursive: true });
for (const name of ['index.html', 'icon.svg', 'manifest.webmanifest', 'sw.js']) cpSync(name, `www/${name}`);
for (const name of ['main.js', 'schedule.js', 'style.css']) cpSync(`src/${name}`, `www/src/${name}`);
console.log('Copied application assets into www/');
