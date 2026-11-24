// Servidor estático simples para rodar o site localmente: node tests/server.mjs [porta]
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon' };

export function iniciarServidor(porta = 5173) {
  const srv = http.createServer(async (req, res) => {
    let caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (caminho.endsWith('/')) caminho += 'index.html';
    const arquivo = normalize(join(RAIZ, caminho));
    if (!arquivo.startsWith(normalize(RAIZ))) { res.writeHead(403).end(); return; }
    try {
      const dados = await readFile(arquivo);
      res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo).toLowerCase()] || 'application/octet-stream' });
      res.end(dados);
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado'); }
  });
  return new Promise(ok => srv.listen(porta, '127.0.0.1', () => ok(srv)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const porta = Number(process.argv[2]) || 5173;
  await iniciarServidor(porta);
  console.log(`Focinho Certo rodando em http://localhost:${porta}`);
}
