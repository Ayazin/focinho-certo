// Validação completa do site com Playwright: npm test
// Gera screenshots em screenshots/ e testa os fluxos principais.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { iniciarServidor } from './server.mjs';

const PORTA = 5199;
const BASE = `http://localhost:${PORTA}/`;
const ZAP = '5511999999999';
const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
mkdirSync('screenshots', { recursive: true });

const resultados = [];
const errosConsole = [];
async function teste(nome, fn) {
  try { await fn(); resultados.push(['✅', nome]); }
  catch (e) { resultados.push(['❌', nome, e.message.split('\n')[0]]); }
}
function confirmar(cond, msg) { if (!cond) throw new Error(msg); }

const srv = await iniciarServidor(PORTA);
const nav = await chromium.launch({ channel: process.env.PW_CANAL || 'chrome' }); // usa o Chrome instalado (PW_CANAL=msedge para o Edge)

async function novaPagina(largura, { semShare = true } = {}) {
  const ctx = await nav.newContext({
    viewport: { width: largura, height: largura < 768 ? 812 : 860 },
    deviceScaleFactor: 1,
    permissions: ['clipboard-read', 'clipboard-write'],
    reducedMotion: 'reduce'
  });
  if (semShare) await ctx.addInitScript(() => { try { delete Navigator.prototype.share; delete Navigator.prototype.canShare; } catch {} });
  const pg = await ctx.newPage();
  pg.on('console', m => { if (m.type() === 'error') errosConsole.push(`[${largura}px] ${m.text()}`); });
  pg.on('pageerror', e => errosConsole.push(`[${largura}px] ${e.message}`));
  pg.on('response', r => { if (r.status() >= 400) errosConsole.push(`[${largura}px] HTTP ${r.status()} ${r.url()}`); });
  return pg;
}
const ir = async (pg, hash = '') => { await pg.goto('about:blank'); await pg.goto(BASE + (hash ? '#' + hash : '')); await pg.waitForSelector('#grade .pet, #grade .vazio', { state: 'attached' }); await pg.evaluate(() => document.fonts.ready); };
const contagem = pg => pg.$$eval('#grade .pet', l => l.length);
const nomesGrade = pg => pg.$$eval('#grade .pet h2', l => l.map(x => x.textContent.trim()));
const toast = pg => pg.textContent('#toast');
const shot = (pg, nome, full = true) => pg.screenshot({ path: `screenshots/${nome}.png`, fullPage: full });

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
  const caminho = new URL(og['og:image']).pathname;
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
