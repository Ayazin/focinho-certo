// Recorta e otimiza uma foto de pet (aceita JPEG, PNG, WebP e AVIF) usando o Chrome.
//
// Ver tamanho e gerar prévia com grade:
//   node tests/otimizar-foto.mjs <entrada> --previa <saida.png>
// Recortar quadrado (centro x,y e lado, em pixels da original) e salvar JPEG:
//   node tests/otimizar-foto.mjs <entrada> <saida.jpg> <centroX> <centroY> <lado> [tamanhoFinal=600] [qualidade=0.82]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const [entrada, saida, ...resto] = process.argv.slice(2);
if (!entrada || !saida) { console.log('Uso: veja o comentário no topo do arquivo.'); process.exit(1); }

const nav = await chromium.launch({ channel: process.env.PW_CANAL || 'chrome' });
const pg = await nav.newPage();
const dados = readFileSync(entrada).toString('base64');
const res = await pg.evaluate(async ({ dados, previa, args }) => {
  const img = new Image();
  img.src = 'data:image/avif;base64,' + dados; // o Chrome detecta o formato real pelo conteúdo
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas');
  if (previa) {
    // prévia reduzida com grade a cada 10% para escolher o recorte
    const esc = Math.min(1, 900 / Math.max(W, H));
    c.width = Math.round(W * esc); c.height = Math.round(H * esc);
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, c.width, c.height);
    x.strokeStyle = 'rgba(255,0,0,.7)'; x.fillStyle = 'red'; x.font = '14px sans-serif';
    for (let i = 1; i < 10; i++) {
      const gx = c.width * i / 10, gy = c.height * i / 10;
      x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, c.height); x.moveTo(0, gy); x.lineTo(c.width, gy); x.stroke();
      x.fillText(Math.round(W * i / 10), gx + 2, 14); x.fillText(Math.round(H * i / 10), 2, gy - 2);
    }
    return { W, H, url: c.toDataURL('image/png') };
  }
  const [cx, cy, lado, final = 600, q = 0.82] = args.map(Number);
  const sx = Math.max(0, Math.min(W - lado, cx - lado / 2)), sy = Math.max(0, Math.min(H - lado, cy - lado / 2));
  c.width = c.height = final;
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, sx, sy, lado, lado, 0, 0, final, final);
  return { W, H, sx, sy, url: c.toDataURL('image/jpeg', q) };
}, { dados, previa: saida === '--previa', args: resto.slice(saida === '--previa' ? 1 : 0) });

const destino = saida === '--previa' ? resto[0] : saida;
writeFileSync(destino, Buffer.from(res.url.split(',')[1], 'base64'));
console.log(`original ${res.W}x${res.H}` + (res.sx !== undefined ? ` · recorte a partir de (${Math.round(res.sx)},${Math.round(res.sy)})` : '') + ` → ${destino}`);
await nav.close();
