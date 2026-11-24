// Validação completa do site com Playwright: npm test
// Gera screenshots em screenshots/ e testa os fluxos principais.
// Nada aqui depende de internet para os mapas: o Leaflet vem de node_modules, e o
// Nominatim, o ViaCEP e os mapas do OpenStreetMap são simulados (FC_MAPA_REAL=1 usa mapas reais só nos screenshots).
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deflateSync, crc32 } from 'node:zlib';
import { iniciarServidor } from './server.mjs';

const PORTA = 5199;
const BASE = `http://localhost:${PORTA}/`;
// número do WhatsApp lido do próprio site, para o teste acompanhar trocas futuras
const ZAP = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8').match(/WHATSAPP_NUMERO = '(\d+)'/)[1];
const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const LEAFLET = {
  'leaflet.js': [readFileSync(require.resolve('leaflet/dist/leaflet.js')), 'text/javascript'],
  'leaflet.css': [readFileSync(require.resolve('leaflet/dist/leaflet.css')), 'text/css']
};
mkdirSync('screenshots', { recursive: true });

// Ladrilho de mapa falso (PNG 1x1 bege) para não usar os servidores do OpenStreetMap nos testes
function pngSolido(r, g, b) {
  const bloco = (tipo, dados) => {
    const t = Buffer.from(tipo, 'ascii'), tam = Buffer.alloc(4), crc = Buffer.alloc(4);
    tam.writeUInt32BE(dados.length); crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
    return Buffer.concat([tam, t, dados, crc]);
  };
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco('IHDR', ihdr), bloco('IDAT', deflateSync(Buffer.from([0, r, g, b]))), bloco('IEND', Buffer.alloc(0))]);
}
const LADRILHO = pngSolido(232, 226, 211);

// Respostas falsas do ViaCEP e do Nominatim
const VIACEP_FALSO = {
  '04101000': { cep: '04101-000', logradouro: 'Rua Vergueiro', bairro: 'Vila Mariana', localidade: 'São Paulo', uf: 'SP' },
  '99999999': { erro: 'true' }
};
const NOMINATIM_FALSO = [
  ['rua vergueiro', { lat: '-23.588', lon: '-46.636', display_name: 'Rua Vergueiro, Vila Mariana, São Paulo', address: { suburb: 'Vila Mariana', city: 'São Paulo' } }],
  ['cambui', { lat: '-22.893', lon: '-47.052', display_name: 'Cambuí, Campinas', address: { suburb: 'Cambuí', city: 'Campinas' } }],
  ['santo andre', { lat: '-23.655', lon: '-46.532', display_name: 'Centro, Santo André', address: { suburb: 'Centro', city: 'Santo André' } }],
  ['pinheiros', { lat: '-23.566', lon: '-46.690', display_name: 'Pinheiros, São Paulo', address: { suburb: 'Pinheiros', city: 'São Paulo' } }]
];
const chamadas = { nominatim: [], viacep: [] };
const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const resultados = [];
const errosConsole = [];
async function teste(nome, fn) {
  try { await fn(); resultados.push(['✅', nome]); }
  catch (e) { resultados.push(['❌', nome, e.message.split('\n')[0]]); }
}
function confirmar(cond, msg) { if (!cond) throw new Error(msg); }

const srv = await iniciarServidor(PORTA);
const nav = await chromium.launch({ channel: process.env.PW_CANAL || 'chrome' }); // usa o Chrome instalado (PW_CANAL=msedge para o Edge)

async function novaPagina(largura, { semShare = true, geo = null, negarGeo = false, semLeaflet = false, mapaReal = false, registrarErros = true } = {}) {
  const ctx = await nav.newContext({
    viewport: { width: largura, height: largura < 768 ? 812 : 860 },
    deviceScaleFactor: 1,
    permissions: ['clipboard-read', 'clipboard-write', ...(geo ? ['geolocation'] : [])],
    ...(geo ? { geolocation: geo } : {}),
    reducedMotion: 'reduce'
  });
  if (semShare) await ctx.addInitScript(() => { try { delete Navigator.prototype.share; delete Navigator.prototype.canShare; } catch {} });
  if (negarGeo) await ctx.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_ok, erro) => setTimeout(() => erro({ code: 1, PERMISSION_DENIED: 1, message: 'User denied Geolocation' }), 50);
  });
  // Leaflet do CDN → cópia local idêntica (o hash SRI do index.html também é verificado pelo navegador)
  await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/*', rota => {
    const arq = rota.request().url().split('/').pop();
    if (semLeaflet || !LEAFLET[arq]) return rota.abort();
    const [body, contentType] = LEAFLET[arq];
    return rota.fulfill({ body, contentType, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  if (!mapaReal) await ctx.route('https://tile.openstreetmap.org/**', rota => rota.fulfill({ body: LADRILHO, contentType: 'image/png' }));
  await ctx.route('https://nominatim.openstreetmap.org/**', rota => {
    const u = new URL(rota.request().url());
    const q = u.searchParams.get('q') || '';
    chamadas.nominatim.push({ q, t: Date.now(), params: Object.fromEntries(u.searchParams) });
    const achado = NOMINATIM_FALSO.find(([chave]) => semAcento(q).includes(chave));
    return rota.fulfill({ json: achado ? [achado[1]] : [], headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await ctx.route('https://viacep.com.br/ws/**', rota => {
    const cep = rota.request().url().match(/ws\/(\d+)\//)?.[1];
    chamadas.viacep.push(cep);
    return rota.fulfill({ json: VIACEP_FALSO[cep] || { erro: 'true' }, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  const pg = await ctx.newPage();
  if (registrarErros) {
    pg.on('console', m => { if (m.type() === 'error') errosConsole.push(`[${largura}px] ${m.text()}`); });
    pg.on('pageerror', e => errosConsole.push(`[${largura}px] ${e.message}`));
    pg.on('response', r => { if (r.status() >= 400) errosConsole.push(`[${largura}px] HTTP ${r.status()} ${r.url()}`); });
  }
  return pg;
}
const ir = async (pg, hash = '') => { await pg.goto('about:blank'); await pg.goto(BASE + (hash ? '#' + hash : '')); await pg.waitForSelector('#grade .pet, #grade .vazio', { state: 'attached' }); await pg.evaluate(() => document.fonts.ready); };
const contagem = pg => pg.$$eval('#grade .pet', l => l.length);
const nomesGrade = pg => pg.$$eval('#grade .pet h2', l => l.map(x => x.textContent.trim()));
const toast = pg => pg.textContent('#toast');
const shot = (pg, nome, full = true) => pg.screenshot({ path: `screenshots/${nome}.png`, fullPage: full });
const esperarMapa = async (pg, sel = '#mapa-pets') => { await pg.waitForSelector(`${sel} .leaflet-marker-icon`); await pg.waitForTimeout(250); };

// ================= SCREENSHOTS =================
for (const [rotulo, largura] of [['celular', 375], ['desktop', 1280]]) {
  const pg = await novaPagina(largura);
  await ir(pg);
  await shot(pg, `${rotulo}-01-inicio`);
  await ir(pg, 'animais');
  await shot(pg, `${rotulo}-02-animais`);
  if (largura < 1024) { await pg.click('#filtro-btn'); await pg.waitForTimeout(100); await shot(pg, `${rotulo}-03-filtros`, false); await pg.keyboard.press('Escape'); }
  await pg.click('#grade a[href="#pet/biscoito"]');
  await pg.waitForSelector('#dlg-pet[open]');
  await shot(pg, `${rotulo}-04-detalhes-pet`, false);
  await pg.keyboard.press('Escape');
  if (await pg.isVisible('#menu-btn')) await pg.click('#menu-btn');
  await pg.click('[data-nav="quiz"]');
  await pg.waitForSelector('#comecar-quiz');
  await shot(pg, `${rotulo}-05-quiz-inicio`);
  await pg.click('#comecar-quiz');
  await pg.click('.opcao[data-op="0"]');
  await shot(pg, `${rotulo}-06-quiz-pergunta`);
  for (const op of [1, 3, 2, 1, 0]) { await pg.click(`.opcao[data-op="${op}"]`); await pg.click('#quiz-proxima'); }
  await pg.waitForSelector('.resultado');
  await pg.waitForFunction(() => [...document.querySelectorAll('.resultado img')].every(i => i.complete));
  await shot(pg, `${rotulo}-07-quiz-resultado`);
  await pg.goto(BASE + '#beneficios'); await pg.waitForSelector('.plano');
  await shot(pg, `${rotulo}-08-beneficios`);
  await pg.evaluate(() => localStorage.setItem('fc-favoritos', '["biscoito","luna"]'));
  await pg.goto(BASE + '#minha-area'); await pg.reload(); await pg.waitForSelector('#favoritos .pet');
  await shot(pg, `${rotulo}-09-minha-area`);
  if (largura < 900) { await pg.goto(BASE); await pg.waitForSelector('#carrossel .pet'); await pg.click('#menu-btn'); await shot(pg, `${rotulo}-10-menu-aberto`, false); }
  await pg.context().close();
}

// Pipoca (coelho): card e detalhes
for (const [rotulo, largura] of [['celular', 375], ['desktop', 1280]]) {
  const pg = await novaPagina(largura);
  await ir(pg, 'animais');
  const card = pg.locator('#grade .pet', { has: pg.locator('a[href="#pet/pipoca"]') });
  await card.scrollIntoViewIfNeeded();
  await pg.waitForFunction(() => [...document.querySelectorAll('#grade img')].every(i => i.complete && i.naturalWidth));
  await card.screenshot({ path: `screenshots/${rotulo}-11-card-pipoca.png` });
  await pg.click('#grade a[href="#pet/pipoca"]');
  await pg.waitForSelector('#dlg-pet[open]');
  await pg.waitForFunction(() => [...document.querySelectorAll('#dlg-pet img')].every(i => i.complete && i.naturalWidth));
  await shot(pg, `${rotulo}-12-detalhes-pipoca`, false);
  await pg.context().close();
}

// Animais e Banho & Tosa com localização (FC_MAPA_REAL=1 usa mapas reais do OpenStreetMap)
for (const [rotulo, largura] of [['celular', 375], ['desktop', 1280]]) {
  const pg = await novaPagina(largura, { geo: { latitude: -23.561, longitude: -46.690 }, mapaReal: process.env.FC_MAPA_REAL === '1' });
  await ir(pg, 'animais');
  await pg.click('[data-page="animais"] [data-usar-local]');
  await pg.waitForSelector('#grade .selo-perto');
  if (largura >= 1024) await esperarMapa(pg);
  await pg.waitForTimeout(process.env.FC_MAPA_REAL === '1' ? 2500 : 300);
  await shot(pg, `${rotulo}-13-animais-perto`);
  if (largura < 1024) {
    await pg.click('[data-modo="mapa"]');
    await esperarMapa(pg);
    await pg.waitForTimeout(process.env.FC_MAPA_REAL === '1' ? 2500 : 300);
    await pg.locator('.perto').scrollIntoViewIfNeeded();
    await shot(pg, `${rotulo}-14-animais-mapa`, false);
  }
  await pg.click(largura < 900 ? '#menu-btn' : '[data-nav="beneficios"]');
  if (largura < 900) await pg.click('[data-nav="beneficios"]');
  await pg.evaluate(() => { location.hash = 'beneficios/tosa'; });
  await esperarMapa(pg, '#mapa-parceiros');
  await pg.waitForTimeout(process.env.FC_MAPA_REAL === '1' ? 2500 : 300);
  await pg.locator('#tosa .grid-tosa').screenshot({ path: `screenshots/${rotulo}-15-banho-tosa-mapa.png` });
  await pg.context().close();
}

// ================= FLUXOS =================
for (const largura of [375, 1280]) {
  const L = `[${largura}px]`;
  const pg = await novaPagina(largura);
  const celular = largura < 1024;

  await teste(`${L} Sem rolagem horizontal em nenhuma página`, async () => {
    for (const h of ['', 'animais', 'quiz', 'beneficios', 'minha-area']) {
      await ir(pg, h);
      const w = await pg.evaluate(() => document.documentElement.scrollWidth);
      confirmar(w <= largura, `#${h || 'inicio'} tem ${w}px de largura`);
    }
  });

  await teste(`${L} Navegação no topo (${celular && largura < 900 ? 'menu hambúrguer' : 'links visíveis'}) e sem barra inferior`, async () => {
    await ir(pg);
    const fixosEmbaixo = await pg.evaluate(() => [...document.querySelectorAll('body *')].filter(el => {
      const s = getComputedStyle(el); const r = el.getBoundingClientRect();
      return (s.position === 'fixed' || s.position === 'sticky') && r.bottom >= innerHeight - 2 && r.height > 30 && el.id !== 'toast';
    }).length);
    confirmar(fixosEmbaixo === 0, 'existe barra fixa na parte inferior');
    if (largura < 900) {
      confirmar(!(await pg.isVisible('#menu a[data-nav="animais"]')), 'menu deveria começar fechado');
      await pg.click('#menu-btn');
      confirmar(await pg.isVisible('#menu a[data-nav="animais"]'), 'menu não abriu');
      confirmar(await pg.getAttribute('#menu-btn', 'aria-expanded') === 'true', 'aria-expanded não mudou');
      await pg.keyboard.press('Escape');
      confirmar(!(await pg.isVisible('#menu a[data-nav="animais"]')), 'Esc não fechou o menu');
      await pg.click('#menu-btn'); await pg.click('#menu a[data-nav="beneficios"]');
      await pg.waitForSelector('.plano', { state: 'visible', timeout: 3000 }).catch(() => {});
      confirmar(await pg.isVisible('.plano'), 'link do menu não levou a Benefícios');
      confirmar(!(await pg.isVisible('#menu a[data-nav="animais"]')), 'menu não fechou após clicar no link');
    } else {
      confirmar(!(await pg.isVisible('#menu-btn')), 'hambúrguer não deveria aparecer no desktop');
      await pg.click('#menu a[data-nav="animais"]');
      await pg.waitForSelector('#menu a[data-nav="animais"][aria-current="page"]', { timeout: 3000 }).catch(() => {});
      confirmar(await pg.getAttribute('#menu a[data-nav="animais"]', 'aria-current') === 'page', 'aria-current não marcado');
    }
  });

  await teste(`${L} Filtrar animais (espécie, porte, idade, personalidade, limpar)`, async () => {
    await ir(pg, 'animais');
    confirmar(await contagem(pg) === 4, 'deveria listar 4 pets');
    const raiz = celular ? '#dlg-filtros' : '.filtros-lateral';
    const abrir = async () => { if (celular && !(await pg.isVisible('#dlg-filtros'))) await pg.click('#filtro-btn'); };
    await abrir();
    await pg.click(`${raiz} .chip[data-k="especie"][data-v="gato"]`);
    if (celular) await pg.click('#aplicar');
    confirmar(JSON.stringify(await nomesGrade(pg)) === '["Luna"]', 'Gatos deveria mostrar só Luna: ' + await nomesGrade(pg));
    if (celular) confirmar(await pg.textContent('#badge') === '1', 'contador de filtros deveria ser 1');
    await abrir();
    await pg.click(`${raiz} .chip[data-k="especie"][data-v="todos"]`);
    await pg.click(`${raiz} .chip[data-k="personalidade"][data-v="Calmo"]`);
    if (celular) await pg.click('#aplicar');
    confirmar(JSON.stringify(await nomesGrade(pg)) === '["Luna","Max","Pipoca"]', 'Calmo: ' + await nomesGrade(pg));
    await abrir();
    await pg.click(`${raiz} .chip[data-k="idade"][data-v="Filhotes"]`);
    if (celular) await pg.click('#aplicar');
    confirmar(JSON.stringify(await nomesGrade(pg)) === '["Pipoca"]', 'Calmo+Filhotes: ' + await nomesGrade(pg));
    await abrir();
    await pg.click(`${raiz} .chip[data-k="porte"][data-v="Grande"]`);
    if (celular) await pg.click('#aplicar');
    confirmar(await contagem(pg) === 0 && await pg.isVisible('#grade .vazio'), 'deveria mostrar estado vazio');
    await pg.click('[data-limpar-vazio]');
    confirmar(await contagem(pg) === 4, 'limpar filtros deveria voltar a 4');
  });

  await teste(`${L} Busca por raça a partir da página inicial`, async () => {
    await ir(pg);
    await pg.fill('#q-inicio', 'beagle'); await pg.press('#q-inicio', 'Enter');
    await pg.waitForFunction(() => location.hash === '#animais');
    confirmar(JSON.stringify(await nomesGrade(pg)) === '["Max"]', 'busca beagle: ' + await nomesGrade(pg));
    await pg.fill('#q-animais', 'gato');
    confirmar(JSON.stringify(await nomesGrade(pg)) === '["Luna"]', 'busca gato: ' + await nomesGrade(pg));
    await pg.fill('#q-animais', '');
  });

  await teste(`${L} Atalho de espécie na página inicial filtra Animais`, async () => {
    await ir(pg);
    await pg.click('.esp[data-esp="cao"]');
    await pg.waitForFunction(() => location.hash === '#animais');
    confirmar(JSON.stringify(await nomesGrade(pg)) === '["Biscoito","Max"]', 'Cães: ' + await nomesGrade(pg));
  });

  await teste(`${L} Abrir detalhes do pet + "Quero adotar" no WhatsApp`, async () => {
    await ir(pg, 'animais');
    await pg.click('#grade a[href="#pet/biscoito"]');
    await pg.waitForSelector('#dlg-pet[open]');
    confirmar((await pg.textContent('#pet-nome')).includes('Biscoito'), 'nome errado');
    confirmar((await pg.textContent('#dlg-pet')).includes('Sobre o Biscoito'), 'falta "Sobre o Biscoito"');
    const href = await pg.getAttribute('#quero-adotar', 'href');
    const u = new URL(href);
    confirmar(u.host === 'wa.me' && u.pathname === '/' + ZAP, 'link do WhatsApp errado: ' + href);
    confirmar(u.searchParams.get('text') === 'Olá! Tenho interesse em adotar o Biscoito', 'mensagem errada: ' + u.searchParams.get('text'));
    confirmar(await pg.getAttribute('#quero-adotar', 'target') === '_blank', 'deveria abrir em nova aba');
    confirmar(await pg.evaluate(() => location.hash) === '#pet/biscoito', 'URL do pet não atualizou');
  });

  await teste(`${L} Janela prende o foco do teclado (Tab e Shift+Tab)`, async () => {
    for (let i = 0; i < 14; i++) {
      await pg.keyboard.press('Tab');
      confirmar(await pg.evaluate(() => document.querySelector('#dlg-pet').contains(document.activeElement)), `foco saiu da janela no Tab ${i + 1}`);
    }
    for (let i = 0; i < 14; i++) {
      await pg.keyboard.press('Shift+Tab');
      confirmar(await pg.evaluate(() => document.querySelector('#dlg-pet').contains(document.activeElement)), `foco saiu da janela no Shift+Tab ${i + 1}`);
    }
  });

  await teste(`${L} Compartilhar sem navigator.share copia o link e avisa "Link copiado"`, async () => {
    await pg.click('#compartilhar');
    await pg.waitForFunction(() => document.querySelector('#toast').classList.contains('ver'));
    confirmar(await toast(pg) === 'Link copiado', 'aviso: ' + await toast(pg));
    confirmar(await pg.isVisible('#toast'), 'aviso não ficou visível sobre a janela');
    const clip = await pg.evaluate(() => navigator.clipboard.readText());
    confirmar(clip === BASE + '#pet/biscoito', 'link copiado errado: ' + clip);
  });

  await teste(`${L} Esc fecha a janela, devolve o foco e volta a URL`, async () => {
    await pg.keyboard.press('Escape');
    confirmar(!(await pg.$('#dlg-pet[open]')), 'janela não fechou');
    await pg.waitForFunction(() => location.hash === '#animais');
    const foco = await pg.evaluate(() => document.activeElement.getAttribute('href'));
    confirmar(foco === '#pet/biscoito', 'foco não voltou ao card: ' + foco);
  });

  if (celular) await teste(`${L} Janela de filtros fecha com Esc e prende o foco`, async () => {
    await pg.click('#filtro-btn');
    await pg.waitForSelector('#dlg-filtros[open]');
    for (let i = 0; i < 30; i++) {
      await pg.keyboard.press('Tab');
      confirmar(await pg.evaluate(() => document.querySelector('#dlg-filtros').contains(document.activeElement)), `foco saiu no Tab ${i + 1}`);
    }
    await pg.keyboard.press('Escape');
    confirmar(!(await pg.$('#dlg-filtros[open]')), 'Esc não fechou os filtros');
    confirmar(await pg.evaluate(() => document.activeElement.id) === 'filtro-btn', 'foco não voltou ao botão Filtros');
  });

  await teste(`${L} Link direto para o pet (#pet/luna) abre os detalhes`, async () => {
    await pg.goto(BASE + '#pet/luna');
    await pg.waitForSelector('#dlg-pet[open]');
    confirmar((await pg.textContent('#pet-nome')).includes('Luna'), 'não abriu a Luna');
    confirmar((await pg.textContent('#dlg-pet')).includes('Sobre a Luna'), 'falta "Sobre a Luna"');
    const t = new URL(await pg.getAttribute('#quero-adotar', 'href')).searchParams.get('text');
    confirmar(t === 'Olá! Tenho interesse em adotar a Luna', 'mensagem: ' + t);
    await pg.click('#dlg-pet [data-fechar]');
    confirmar(!(await pg.$('#dlg-pet[open]')), 'botão voltar não fechou');
  });

  await teste(`${L} Quiz completo até o resultado (+ outros matches e ver perfil)`, async () => {
    await ir(pg, 'quiz');
    await pg.click('#comecar-quiz');
    confirmar(await pg.getAttribute('.progresso', 'aria-valuenow') === '1', 'progresso deveria ser 1');
    confirmar(await pg.getAttribute('#quiz-proxima', 'aria-disabled') === 'true', 'Próxima deveria estar desabilitado sem resposta');
    await pg.click('#quiz-proxima', { force: true });
    confirmar(await toast(pg) === 'Escolha uma opção para continuar', 'deveria pedir uma opção');
    const respostas = [1, 3, 2, 1, 0]; // perfil ativo → Biscoito
    for (const [i, op] of respostas.entries()) {
      confirmar((await pg.textContent('.passo-txt')) === `Pergunta ${i + 1} de 5`, 'passo errado');
      await pg.click(`.opcao[data-op="${op}"]`);
      confirmar(await pg.getAttribute(`.opcao[data-op="${op}"]`, 'aria-pressed') === 'true', 'opção não marcada');
      if (i === 2) { // testa o voltar
        await pg.click('#quiz-voltar');
        confirmar((await pg.textContent('.passo-txt')) === 'Pergunta 2 de 5', 'voltar não funcionou');
        confirmar(await pg.getAttribute('.opcao[data-op="3"]', 'aria-pressed') === 'true', 'resposta anterior perdida');
        await pg.click('#quiz-proxima');
        await pg.click(`.opcao[data-op="${op}"]`);
      }
      await pg.click('#quiz-proxima');
    }
    await pg.waitForSelector('.resultado');
    confirmar(await pg.textContent('.resultado h2') === 'Biscoito', 'match esperado Biscoito, veio ' + await pg.textContent('.resultado h2'));
    const pct = await pg.textContent('.pct');
    confirmar(/^\d{2}% de compatibilidade$/.test(pct), 'porcentagem: ' + pct);
    await pg.click('#outros-matches');
    confirmar(await pg.textContent('.resultado h2') !== 'Biscoito', 'outros matches não trocou o pet');
    confirmar((await pg.textContent('.resultado h1')).includes('2º match'), 'título do 2º match');
    await pg.click('.resultado a.btn');
    await pg.waitForSelector('#dlg-pet[open]');
    await pg.keyboard.press('Escape');
    await pg.waitForFunction(() => location.hash === '#quiz');
    confirmar(await pg.isVisible('.resultado'), 'ao fechar o perfil deveria voltar ao resultado');
  });

  await teste(`${L} Copiar cupom FOCINHOCERTO`, async () => {
    await ir(pg, 'beneficios/tosa');
    await pg.click('#copiar-cupom');
    await pg.waitForFunction(() => document.querySelector('#toast').classList.contains('ver'));
    confirmar(await toast(pg) === 'Cupom copiado!', 'aviso: ' + await toast(pg));
    confirmar(await pg.evaluate(() => navigator.clipboard.readText()) === 'FOCINHOCERTO', 'área de transferência errada');
    confirmar((await pg.textContent('#copiar-cupom')).includes('Copiado!'), 'botão não mudou para Copiado!');
    confirmar(await pg.getAttribute('#copiar-cupom', 'aria-label') === 'Copiar cupom FOCINHOCERTO', 'botão sem rótulo acessível');
  });

  await teste(`${L} Planos: 3 botões "Tenho interesse" no WhatsApp e sem tela de contratação`, async () => {
    await ir(pg, 'beneficios/planos');
    const links = await pg.$$eval('.plano a.btn', l => l.map(a => [a.textContent, a.href]));
    confirmar(links.length === 3, 'deveria haver 3 planos');
    for (const [nome, [txt, href]] of [['Bronze', links[0]], ['Prata', links[1]], ['Ouro', links[2]]]) {
      confirmar(txt.startsWith('Tenho interesse'), 'texto do botão: ' + txt);
      const u = new URL(href);
      confirmar(u.pathname === '/' + ZAP && u.searchParams.get('text') === `Olá! Tenho interesse no Plano ${nome} do Focinho Certo`, 'link: ' + href);
    }
    const corpo = await pg.textContent('body');
    confirmar(!/Quero contratar|Contratação realizada/.test(corpo), 'ainda existe texto de contratação');
  });

  await teste(`${L} Favoritar pet e ver em Minha área (persiste ao recarregar)`, async () => {
    await pg.evaluate(() => localStorage.clear());
    await ir(pg, 'animais');
    await pg.click('#grade [data-fav="max"]');
    confirmar(await pg.textContent('#fav-cont') === '1', 'contador de favoritos');
    await pg.reload(); await pg.waitForSelector('#grade .pet', { state: 'attached' });
    await pg.goto(BASE + '#minha-area');
    confirmar(JSON.stringify(await pg.$$eval('#favoritos .pet h3', l => l.map(x => x.textContent.trim()))) === '["Max"]', 'favorito não apareceu');
    confirmar((await pg.textContent('#ultimo-quiz')).length > 0, 'bloco do quiz vazio');
  });

  await teste(`${L} Teclado: "Pular para o conteúdo" é o 1º foco e cards abrem com Enter`, async () => {
    await ir(pg);
    await pg.keyboard.press('Tab');
    confirmar(await pg.evaluate(() => document.activeElement.className) === 'pular', 'primeiro foco não é o link de pular');
    await ir(pg, 'animais');
    await pg.focus('#grade a[href="#pet/max"]');
    await pg.keyboard.press('Enter');
    await pg.waitForSelector('#dlg-pet[open]');
    confirmar((await pg.textContent('#pet-nome')).includes('Max'), 'Enter não abriu o Max');
    await pg.keyboard.press('Escape');
    await pg.waitForFunction(() => location.hash === '#animais');
  });

  await teste(`${L} Acessibilidade (axe-core: contraste AA, alt, rótulos) em todas as páginas`, async () => {
    const problemas = [];
    for (const h of ['', 'animais', 'quiz', 'beneficios', 'minha-area', 'pet/biscoito']) {
      await ir(pg, h);
      if (h === 'quiz') { await pg.click('#comecar-quiz'); }
      await pg.addScriptTag({ content: AXE });
      const r = await pg.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map(v => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`));
      r.forEach(x => problemas.push(`#${h || 'inicio'} → ${x}`));
    }
    confirmar(!problemas.length, problemas.join(' ;; '));
  });

  await pg.context().close();
}

// navigator.share existente (ex.: celular): usa o compartilhamento nativo
await teste('[375px] Compartilhar usa navigator.share quando existe', async () => {
  const pg = await novaPagina(375, { semShare: false });
  await pg.addInitScript(() => { navigator.share = async d => { window.__compartilhado = d; }; });
  await ir(pg, 'pet/pipoca');
  await pg.waitForSelector('#dlg-pet[open]');
  await pg.click('#compartilhar');
  const d = await pg.evaluate(() => window.__compartilhado);
  confirmar(d && d.url === BASE + '#pet/pipoca', 'share não recebeu a URL: ' + JSON.stringify(d));
  confirmar(await toast(pg) !== 'Link copiado', 'não deveria copiar quando o share existe');
  await pg.context().close();
});

// ================= MAPA, LOCALIZAÇÃO E DISTÂNCIAS =================
const PINHEIROS = { latitude: -23.561, longitude: -46.690 };
const MORUMBI = { latitude: -23.601, longitude: -46.718 };
const locGrade = pg => pg.$$eval('#grade .pet', l => l.map(c => [c.querySelector('h2').textContent.trim(), c.querySelector('.pet-local')?.textContent.trim(), Boolean(c.querySelector('.selo-perto'))]));
const statusLoc = pg => pg.$eval('[data-page="animais"] .loc-status', e => e.textContent.trim());
const buscarEnd = async (pg, texto, raiz = '[data-page="animais"]') => {
  await pg.fill(`${raiz} [data-busca-local] input`, texto);
  await pg.click(`${raiz} [data-busca-local] button`);
  await pg.waitForFunction(r => { const s = document.querySelector(`${r} .loc-status`); return s && /ok|erro/.test(s.className); }, raiz, { timeout: 8000 });
};
const zerarChamadas = () => { chamadas.nominatim.length = 0; chamadas.viacep.length = 0; };

for (const largura of [375, 1280]) {
  const L = `[${largura}px]`;
  const celular = largura < 1024;

  await teste(`${L} "Usar minha localização" ordena do mais perto ao mais longe e destaca o mais próximo`, async () => {
    zerarChamadas();
    const pg = await novaPagina(largura, { geo: PINHEIROS });
    await ir(pg, 'animais');
    confirmar(JSON.stringify(await nomesGrade(pg)) === '["Biscoito","Luna","Max","Pipoca"]', 'ordem inicial mudou');
    confirmar((await locGrade(pg))[0][1] === 'Pinheiros, São Paulo', 'sem localização deveria mostrar "Bairro, Cidade": ' + (await locGrade(pg))[0][1]);
    await pg.click('[data-page="animais"] [data-usar-local]');
    await pg.waitForSelector('#grade .selo-perto');
    const g = await locGrade(pg);
    confirmar(JSON.stringify(g.map(x => x[0])) === '["Biscoito","Luna","Pipoca","Max"]', 'ordem por distância: ' + g.map(x => x[0]));
    confirmar(g[0][2] && !g.slice(1).some(x => x[2]), 'só o primeiro deveria ter o selo "Mais perto de você"');
    confirmar(/^Pinheiros · a (menos de 1|\d+) km$/.test(g[0][1]), 'texto do Biscoito: ' + g[0][1]);
    confirmar(/^Vila Mariana · a \d+ km$/.test(g[1][1]), 'texto da Luna: ' + g[1][1]);
    confirmar(/^Cambuí, Campinas · a \d+ km$/.test(g[3][1]), 'acima de 30 km deveria mostrar a cidade: ' + g[3][1]);
    confirmar((await statusLoc(pg)).includes('sua localização atual'), 'status: ' + await statusLoc(pg));
    confirmar((await pg.textContent('#contagem')).includes('do mais perto para o mais longe'), 'contagem sem a ordem');
    confirmar(chamadas.nominatim.length === 0 && chamadas.viacep.length === 0, 'o GPS não deveria consultar serviços externos');
    if (!celular) {
      const z = await pg.evaluate(() => mapas['mapa-pets'].getZoom());
      confirmar(z >= 10, `com localização o mapa deveria aproximar da região (zoom ${z})`);
    }
    const salvo = await pg.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    confirmar(!/-23\.56|-46\.69/.test(salvo), 'a localização não deveria ser salva no navegador');

    // filtros continuam valendo junto com a distância
    const raiz = celular ? '#dlg-filtros' : '.filtros-lateral';
    const filtro = async (k, v) => { if (celular) await pg.click('#filtro-btn'); await pg.click(`${raiz} .chip[data-k="${k}"][data-v="${v}"]`); if (celular) await pg.click('#aplicar'); };
    await filtro('especie', 'gato');
    const s1 = await locGrade(pg);
    confirmar(s1.length === 1 && s1[0][0] === 'Luna' && s1[0][2], 'Gatos: Luna deveria ser a única e a mais perto');
    await filtro('especie', 'todos');
    await filtro('personalidade', 'Calmo');
    confirmar(JSON.stringify(await nomesGrade(pg)) === '["Luna","Pipoca","Max"]', 'Calmo + distância: ' + await nomesGrade(pg));

    // detalhes mostram bairro e distância
    await pg.click('#grade a[href="#pet/max"]');
    await pg.waitForSelector('#dlg-pet[open]');
    const locDet = await pg.$eval('#dlg-pet .pet-dados div:last-child dd', e => e.textContent);
    confirmar(/^Cambuí, Campinas - SP · a \d+ km$/.test(locDet), 'detalhes: ' + locDet);
    await pg.keyboard.press('Escape');

    await pg.click('[data-page="animais"] [data-limpar-local]');
    confirmar(!(await pg.$('#grade .selo-perto')), '"Remover" deveria tirar a ordem por distância');
    await pg.context().close();
  });

  await teste(`${L} Permissão de localização negada mostra mensagem amigável`, async () => {
    const pg = await novaPagina(largura, { negarGeo: true });
    await ir(pg, 'animais');
    await pg.click('[data-page="animais"] [data-usar-local]');
    await pg.waitForFunction(() => document.querySelector('[data-page="animais"] .loc-status').classList.contains('erro'));
    const st = await statusLoc(pg);
    confirmar(st.startsWith('Tudo bem!') && st.includes('bairro ou CEP'), 'mensagem: ' + st);
    confirmar(await pg.evaluate(() => document.activeElement.id) === 'end-animais', 'o foco deveria ir para o campo de endereço');
    confirmar(JSON.stringify(await nomesGrade(pg)) === '["Biscoito","Luna","Max","Pipoca"]', 'a ordem não deveria mudar');
    await pg.context().close();
  });

  await teste(`${L} CEP: ViaCEP + Nominatim (respostas simuladas), CEP inexistente e endereço não encontrado`, async () => {
    zerarChamadas();
    const pg = await novaPagina(largura);
    await ir(pg, 'animais');
    await buscarEnd(pg, '04101-000');
    confirmar(JSON.stringify(chamadas.viacep) === '["04101000"]', 'ViaCEP: ' + chamadas.viacep);
    confirmar(chamadas.nominatim.length === 1 && chamadas.nominatim[0].q.startsWith('Rua Vergueiro'), 'Nominatim: ' + JSON.stringify(chamadas.nominatim.map(c => c.q)));
    const p = chamadas.nominatim[0].params;
    confirmar(p.countrycodes === 'br' && p.limit === '1' && p.format === 'jsonv2', 'parâmetros do Nominatim: ' + JSON.stringify(p));
    confirmar((await statusLoc(pg)).includes('Vila Mariana, São Paulo'), 'status: ' + await statusLoc(pg));
    confirmar((await nomesGrade(pg))[0] === 'Luna', 'Luna (Vila Mariana) deveria ser a primeira');

    zerarChamadas();
    await buscarEnd(pg, '99999-999');
    confirmar((await statusLoc(pg)).startsWith('CEP não encontrado'), 'CEP inexistente: ' + await statusLoc(pg));
    confirmar(chamadas.nominatim.length === 0, 'não deveria consultar o Nominatim com CEP inexistente');

    await buscarEnd(pg, 'lugar que não existe');
    confirmar((await statusLoc(pg)).startsWith('Não encontramos esse endereço'), 'não encontrado: ' + await statusLoc(pg));
    await pg.context().close();
  });

  await teste(`${L} Endereço digitado (Cambuí, Campinas): distâncias acima de 30 km mostram a cidade`, async () => {
    const pg = await novaPagina(largura);
    await ir(pg, 'animais');
    await buscarEnd(pg, 'Cambuí, Campinas');
    const g = await locGrade(pg);
    confirmar(g[0][0] === 'Max' && g[0][2], 'Max deveria ser o mais perto: ' + g.map(x => x[0]));
    confirmar(/^Cambuí · a (menos de 1|\d+) km$/.test(g[0][1]), 'Max: ' + g[0][1]);
    confirmar(g.slice(1).every(x => /^[^,]+, (São Paulo|Santo André) · a \d+ km$/.test(x[1])), 'os outros deveriam mostrar a cidade: ' + g.map(x => x[1]));
    await pg.context().close();
  });

  await teste(`${L} Mapa dos pets: atribuição do OpenStreetMap, um marcador por pet filtrado e clique abre os detalhes`, async () => {
    const pg = await novaPagina(largura);
    await ir(pg, 'animais');
    if (celular) {
      confirmar(!(await pg.isVisible('#mapa-pets')), 'no celular o mapa começa escondido (modo Lista)');
      await pg.click('[data-modo="mapa"]');
      confirmar(await pg.getAttribute('[data-modo="mapa"]', 'aria-pressed') === 'true', 'aria-pressed do botão Mapa');
      confirmar(!(await pg.isVisible('#grade')), 'no modo Mapa a lista deveria sumir');
    }
    await esperarMapa(pg);
    const atrib = await pg.textContent('#mapa-pets .leaflet-control-attribution');
    confirmar(atrib.includes('OpenStreetMap'), 'atribuição: ' + atrib);
    confirmar(await pg.isVisible('#mapa-pets .leaflet-control-attribution a[href*="openstreetmap.org/copyright"]'), 'link da atribuição não visível');
    confirmar(await pg.$$eval('#mapa-pets .mapa-pet', l => l.length) === 4, 'deveria haver 4 marcadores');
    confirmar(await pg.getAttribute('#mapa-pets .leaflet-control-zoom-in', 'title') === 'Aproximar', 'botões de zoom em português');
    // zoom funciona mesmo com "movimento reduzido" (os testes rodam com reducedMotion: 'reduce')
    const z0 = await pg.evaluate(() => mapas['mapa-pets'].getZoom());
    await pg.click('#mapa-pets .leaflet-control-zoom-in');
    await pg.waitForTimeout(150);
    confirmar(await pg.evaluate(() => mapas['mapa-pets'].getZoom()) === z0 + 1, 'o botão "Aproximar" não mudou o zoom');
    if (celular) { await pg.click('[data-modo="lista"]'); await pg.click('#filtro-btn'); await pg.click('#dlg-filtros .chip[data-k="especie"][data-v="gato"]'); await pg.click('#aplicar'); await pg.click('[data-modo="mapa"]'); }
    else await pg.click('.filtros-lateral .chip[data-k="especie"][data-v="gato"]');
    await pg.waitForTimeout(200);
    confirmar(await pg.$$eval('#mapa-pets .mapa-pet', l => l.length) === 1, 'com filtro Gatos deveria haver 1 marcador');
    await pg.click('#mapa-pets .mapa-pet-luna');
    await pg.waitForSelector('#dlg-pet[open]');
    confirmar((await pg.textContent('#pet-nome')).includes('Luna'), 'marcador não abriu a Luna');
    await pg.keyboard.press('Escape');
    await pg.waitForFunction(() => location.hash === '#animais');
    // teclado: marcador focável abre com Enter
    await pg.focus('#mapa-pets .mapa-pet-luna');
    await pg.keyboard.press('Enter');
    await pg.waitForSelector('#dlg-pet[open]', { timeout: 3000 });
    await pg.keyboard.press('Escape');
    if (celular) {
      await pg.click('[data-modo="lista"]');
      confirmar(await pg.isVisible('#grade') && !(await pg.isVisible('#mapa-pets')), 'voltar para Lista');
    }
    await pg.context().close();
  });

  await teste(`${L} Banho & Tosa: parceiros do JSON no mapa, aviso de demonstração e ordem por distância`, async () => {
    const pg = await novaPagina(largura, { geo: MORUMBI });
    await ir(pg, 'beneficios/tosa');
    await esperarMapa(pg, '#mapa-parceiros');
    confirmar(await pg.$$eval('#parceiros-lista .parceiro', l => l.length) === 3, 'deveria listar 3 parceiros');
    confirmar(await pg.$$eval('#mapa-parceiros .pin-parceiro', l => l.length) === 3, 'deveria haver 3 alfinetes');
    confirmar((await pg.textContent('#mapa-parceiros .mapa-demo')).includes('Pontos de demonstração'), 'aviso de demonstração no mapa');
    confirmar((await pg.textContent('#mapa-parceiros .leaflet-control-attribution')).includes('OpenStreetMap'), 'atribuição no mapa de parceiros');
    await pg.click('[data-localizador="tosa"] [data-usar-local]');
    await pg.waitForSelector('.parceiro-perto');
    const nomes = await pg.$$eval('#parceiros-lista .p-info strong', l => l.map(x => x.textContent));
    confirmar(nomes[0] === 'Amor & Patas', 'Amor & Patas (Morumbi) deveria ser o primeiro: ' + nomes);
    const dist = await pg.$eval('#parceiros-lista .parceiro-perto .p-dist', e => e.textContent);
    confirmar(/^Morumbi · a (menos de 1|\d+) km$/.test(dist), 'distância do parceiro: ' + dist);
    confirmar((await pg.textContent('[data-page="animais"] .loc-status')).includes('sua localização'), 'a localização deveria valer também para Animais');
    await pg.click('[data-ver-parceiro="amor-e-patas"]');
    await pg.waitForSelector('#mapa-parceiros .leaflet-popup');
    confirmar((await pg.textContent('#mapa-parceiros .leaflet-popup')).includes('Endereço de demonstração'), 'popup sem aviso de demonstração');
    await pg.context().close();
  });
}

await teste('[1280px] Limite de 1 requisição por segundo no Nominatim (e cache de buscas repetidas)', async () => {
  zerarChamadas();
  const pg = await novaPagina(1280);
  await ir(pg, 'animais');
  await buscarEnd(pg, 'Pinheiros');
  await buscarEnd(pg, 'Centro, Santo André');
  confirmar(chamadas.nominatim.length === 2, 'deveriam ser 2 chamadas: ' + chamadas.nominatim.length);
  const intervalo = chamadas.nominatim[1].t - chamadas.nominatim[0].t;
  confirmar(intervalo >= 1000, `intervalo entre chamadas de ${intervalo} ms (mínimo 1000)`);
  await buscarEnd(pg, 'Pinheiros');
  confirmar(chamadas.nominatim.length === 2, 'busca repetida deveria vir do cache');
  // o campo de busca não consulta nada enquanto a pessoa digita
  await pg.fill('[data-page="animais"] [data-busca-local] input', 'Vila Madalena, São Paulo');
  await pg.waitForTimeout(1300);
  confirmar(chamadas.nominatim.length === 2, 'digitar não deveria consultar o Nominatim');
  await pg.context().close();
});

await teste('[1280px] Sem o Leaflet (CDN fora do ar), a lista e as distâncias continuam funcionando', async () => {
  const pg = await novaPagina(1280, { semLeaflet: true, geo: PINHEIROS, registrarErros: false });
  const erros = [];
  pg.on('pageerror', e => erros.push(e.message));
  await ir(pg, 'animais');
  confirmar(await pg.isVisible('#mapa-pets .mapa-falha'), 'deveria mostrar aviso no lugar do mapa');
  await pg.click('[data-page="animais"] [data-usar-local]');
  await pg.waitForSelector('#grade .selo-perto');
  confirmar((await nomesGrade(pg))[0] === 'Biscoito', 'ordem por distância sem mapa');
  confirmar(!erros.length, 'erros de JavaScript: ' + erros.join(' | '));
  await pg.context().close();
});

await teste('Avisos de projeto demonstrativo no rodapé e perto do cupom', async () => {
  const pg = await novaPagina(375);
  await ir(pg, 'beneficios/tosa');
  confirmar((await pg.textContent('.cupom .demo-aviso')).includes('Projeto demonstrativo'), 'aviso do cupom');
  confirmar(await pg.isVisible('.cupom .demo-aviso'), 'aviso do cupom não visível');
  const rod = await pg.textContent('.rodape .demo-rodape');
  confirmar(/Projeto demonstrativo/.test(rod) && /parceiras/.test(rod) && /planos/.test(rod), 'aviso do rodapé: ' + rod);
  confirmar((await pg.textContent('.rodape .copy')).includes('OpenStreetMap'), 'crédito do OpenStreetMap no rodapé');
  await pg.context().close();
});

await teste('Dados de localização: pets com coordenadas aproximadas (3 casas) e parceiros marcados como demonstração', async () => {
  const pets = JSON.parse(readFileSync(new URL('../docs/data/pets.json', import.meta.url), 'utf8'));
  for (const p of pets) {
    confirmar(p.bairro && typeof p.latitude === 'number' && typeof p.longitude === 'number', `${p.nome} sem bairro/coordenadas`);
    const casas = n => (String(n).split('.')[1] || '').length;
    confirmar(casas(p.latitude) <= 3 && casas(p.longitude) <= 3, `${p.nome}: use no máximo 3 casas decimais (centro do bairro), não o endereço exato`);
  }
  const parc = JSON.parse(readFileSync(new URL('../docs/data/parceiros.json', import.meta.url), 'utf8'));
  confirmar(parc.length === 3 && parc.every(p => typeof p.latitude === 'number' && p.demonstracao === true), 'parceiros.json');
});

await teste('Todas as fotos dos pets (pets.json) carregam e são quadradas', async () => {
  const pg = await novaPagina(1280);
  await ir(pg, 'animais');
  const fotos = await pg.evaluate(async () => {
    const pets = await (await fetch('data/pets.json')).json();
    return Promise.all(pets.map(async p => {
      const i = new Image(); i.src = p.foto;
      try { await i.decode(); } catch { return [p.nome, 0, 0]; }
      return [p.nome, i.naturalWidth, i.naturalHeight];
    }));
  });
  for (const [nome, w, h] of fotos) {
    confirmar(w > 0, `foto de ${nome} não carregou`);
    confirmar(nome === 'Max' || Math.abs(w - h) <= 2, `foto de ${nome} não é quadrada (${w}x${h})`);
  }
  await pg.context().close();
});

await teste('Tags Open Graph completas e imagem de prévia 1200x630 disponível', async () => {
  const pg = await novaPagina(1280);
  await ir(pg);
  const og = await pg.$$eval('meta[property^="og:"], meta[name^="twitter:"]', l => Object.fromEntries(l.map(m => [m.getAttribute('property') || m.getAttribute('name'), m.content])));
  for (const k of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:image:alt', 'twitter:card'])
    confirmar(og[k], 'falta ' + k);
  confirmar(og['twitter:card'] === 'summary_large_image', 'twitter:card');
  confirmar(og['og:url'] === 'https://ayazin.github.io/focinho-certo/', 'og:url: ' + og['og:url']);
  confirmar(og['og:image'].startsWith(og['og:url']), 'og:image fora do endereço do site: ' + og['og:image']);
  const caminho = '/' + og['og:image'].slice(og['og:url'].length); // mesmo arquivo, servido localmente
  const dim = await pg.evaluate(async src => { const i = new Image(); i.src = src; await i.decode(); return [i.naturalWidth, i.naturalHeight]; }, caminho);
  confirmar(dim[0] === 1200 && dim[1] === 630, 'imagem com ' + dim.join('x'));
  await pg.context().close();
});

await teste('Só a pasta docs/ é servida (referencias/, tests/ e CLAUDE.md ficam fora do site)', async () => {
  for (const caminho of ['referencias/site-atual.html', 'tests/validar.mjs', 'CLAUDE.md', 'package.json', 'data/LEIA-ME.md'])
    confirmar((await fetch(BASE + caminho)).status === 404, caminho + ' não deveria estar no site');
  for (const caminho of ['index.html', 'css/style.css', 'js/app.js', 'data/pets.json', 'img/og-preview.png'])
    confirmar((await fetch(BASE + caminho)).status === 200, caminho + ' deveria estar no site');
});

await teste('Console do navegador sem erros (e nenhum arquivo 404)', async () => {
  confirmar(!errosConsole.length, [...new Set(errosConsole)].join(' ;; '));
});

await nav.close();
srv.close();

console.log('\n================ RESULTADO ================');
for (const [s, n, e] of resultados) console.log(`${s} ${n}${e ? `\n     → ${e}` : ''}`);
const falhas = resultados.filter(r => r[0] === '❌').length;
console.log(`\n${resultados.length - falhas}/${resultados.length} testes passaram`);
process.exit(falhas ? 1 : 0);
