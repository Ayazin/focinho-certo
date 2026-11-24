// Gera docs/img/og-preview.png (1200x630) a partir de tests/og-modelo.html: node tests/gerar-og.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { iniciarServidor } from './server.mjs';

const PORTA = 5198;
const srv = await iniciarServidor(PORTA);
const nav = await chromium.launch({ channel: process.env.PW_CANAL || 'chrome' });
const pg = await nav.newPage({ viewport: { width: 1200, height: 630 } });
// Abre o site e injeta o modelo: assim /img/... resolve para docs/img/...
await pg.goto(`http://localhost:${PORTA}/`);
await pg.setContent(readFileSync(new URL('./og-modelo.html', import.meta.url), 'utf8'), { waitUntil: 'networkidle' });
await pg.evaluate(() => document.fonts.ready);
await pg.waitForFunction(() => [...document.images].every(i => i.complete));
await pg.screenshot({ path: 'docs/img/og-preview.png' });
console.log('ok docs/img/og-preview.png');
await nav.close();
srv.close();
