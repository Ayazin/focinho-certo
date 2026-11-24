// Recorta ilustrações e fotos das telas de referência do app (uso único).
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
const TMP = mkdtempSync(join(tmpdir(), 'recorte-'));

const REF = p => pathToFileURL(resolve('referencias/telas-app', p)).href;
const cortes = [
  ['resultadoquiz.jpeg', 'docs/img/pets/biscoito.jpg', { x: 87, y: 233, width: 356, height: 356 }],
  ['quiz.jpeg', 'docs/img/quiz/casa.png', { x: 62, y: 362, width: 136, height: 132 }],
  ['quiz.jpeg', 'docs/img/quiz/ar-livre.png', { x: 376, y: 366, width: 152, height: 124 }],
  ['quiz.jpeg', 'docs/img/quiz/agenda.png', { x: 86, y: 668, width: 108, height: 110 }],
  ['quiz.jpeg', 'docs/img/quiz/sofa.png', { x: 364, y: 674, width: 162, height: 110 }],
  ['quiz (2).jpeg', 'docs/img/quiz/cao-gato.png', { x: 112, y: 286, width: 332, height: 300 }],
];
const nav = await chromium.launch({ channel: process.env.PW_CANAL || 'chrome' }); // usa o Chrome instalado (PW_CANAL=msedge para o Edge)
const pg = await nav.newPage({ viewport: { width: 1400, height: 1600 } });
for (const [ref, saida, clip] of cortes) {
  const html = join(TMP, 'r.html');
  writeFileSync(html, `<body style="margin:0"><img src="${REF(ref)}" style="display:block"></body>`);
  await pg.goto(pathToFileURL(html).href);
  await pg.waitForFunction(() => document.images[0].complete);
  await pg.screenshot({ path: saida, clip, type: saida.endsWith('.jpg') ? 'jpeg' : 'png', ...(saida.endsWith('.jpg') ? { quality: 90 } : {}) });
  console.log('ok', saida);
}
await nav.close();
