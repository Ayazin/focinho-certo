/* =========================================================
   Focinho Certo – site de adoção de pets
   ========================================================= */

// ▼ Número do WhatsApp que recebe os contatos (DDI + DDD + número, só dígitos)
const WHATSAPP_NUMERO = '5511946636315';

const CUPOM = 'FOCINHOCERTO';
const ARQUIVO_PETS = 'data/pets.json';

/* ---------- Utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const semAcento = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const icone = (id, cls = 'ic') => `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#${id}"/></svg>`;
const whatsLink = msg => `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(msg)}`;

const armazenar = {
  ler(chave, padrao) { try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : padrao; } catch { return padrao; } },
  gravar(chave, valor) { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ } }
};

const ehFemea = p => p.sexo === 'Fêmea';
const artigo = p => (ehFemea(p) ? 'a' : 'o');
const faixaEtaria = idade => (idade < 1 ? 'Filhotes' : idade >= 8 ? 'Idosos' : 'Adultos');
function textoIdade(idade) {
  if (idade < 1) { const m = Math.max(1, Math.round(idade * 12)); return `${m} ${m === 1 ? 'mês' : 'meses'}`; }
  const a = Math.floor(idade);
  return `${a} ${a === 1 ? 'ano' : 'anos'}`;
}
const NOME_ESPECIE = { cao: 'cão cachorro cães', gato: 'gato gata gatos', outro: 'outros coelho' };

/* ---------- Aviso (toast) ---------- */
const toastEl = $('#toast');
let toastTimer;
function aviso(msg) {
  // Dentro de uma janela aberta o aviso precisa estar na camada da janela
  const host = $('dialog[open]') || document.body;
  if (toastEl.parentElement !== host) host.appendChild(toastEl);
  toastEl.textContent = msg;
  toastEl.classList.add('ver');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('ver'), 2600);
}

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const t = document.createElement('textarea');
    t.value = texto; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    ($('dialog[open]') || document.body).appendChild(t);
    t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    t.remove();
    return ok;
  }
}

/* ---------- Estado ---------- */
let PETS = [];
const FILTROS = {
  especie: [['todos', 'Todos', 'i-pata'], ['cao', 'Cães', 'i-cao'], ['gato', 'Gatos', 'i-gato'], ['outro', 'Outros', 'i-coelho']],
  porte: [['todos', 'Todos'], ['Pequeno', 'Pequeno'], ['Médio', 'Médio'], ['Grande', 'Grande']],
  idade: [['todos', 'Todos'], ['Filhotes', 'Filhotes'], ['Adultos', 'Adultos'], ['Idosos', 'Idosos']],
  personalidade: ['Ativo', 'Calmo', 'Sociável', 'Tímido', 'Brincalhão', 'Dócil', 'Curioso'].map(x => [x, x])
};
const ROTULO_FILTRO = { especie: 'Espécie', porte: 'Porte', idade: 'Idade', personalidade: 'Personalidade' };
const estado = { q: '', especie: 'todos', porte: 'todos', idade: 'todos', personalidade: new Set() };
const favoritos = new Set(armazenar.ler('fc-favoritos', []));

/* ---------- Menu (hambúrguer) ---------- */
const menuBtn = $('#menu-btn'), menu = $('#menu');
function menuAbrir(abrir) {
  menu.classList.toggle('aberto', abrir);
  menuBtn.setAttribute('aria-expanded', abrir);
  menuBtn.setAttribute('aria-label', abrir ? 'Fechar menu' : 'Abrir menu');
  $('use', menuBtn).setAttribute('href', abrir ? '#i-fechar' : '#i-menu');
}
menuBtn.addEventListener('click', () => menuAbrir(menuBtn.getAttribute('aria-expanded') !== 'true'));
menu.addEventListener('click', e => { if (e.target.closest('a')) menuAbrir(false); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && menu.classList.contains('aberto')) { menuAbrir(false); menuBtn.focus(); }
});
document.addEventListener('click', e => {
  if (menu.classList.contains('aberto') && !e.composedPath().includes($('.topo'))) menuAbrir(false);
});

/* ---------- Janelas: Esc, foco preso, clique fora ---------- */
const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
const origemFoco = new WeakMap();
function abrirJanela(dlg) {
  if (!dlg.open) {
    origemFoco.set(dlg, document.activeElement);
    dlg.showModal();
  }
  const alvo = $('[autofocus]', dlg) || $$(FOCAVEIS, dlg)[0];
  if (alvo) alvo.focus();
  dlg.scrollTop = 0;
}
$$('dialog.janela').forEach(dlg => {
  dlg.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); dlg.close(); return; }
    if (e.key !== 'Tab') return;
    const itens = $$(FOCAVEIS, dlg).filter(el => el.offsetParent !== null || el === document.activeElement);
    if (!itens.length) { e.preventDefault(); return; }
    const primeiro = itens[0], ultimo = itens[itens.length - 1];
    if (e.shiftKey && (document.activeElement === primeiro || !dlg.contains(document.activeElement))) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && (document.activeElement === ultimo || !dlg.contains(document.activeElement))) { e.preventDefault(); primeiro.focus(); }
  });
  dlg.addEventListener('cancel', e => { e.preventDefault(); dlg.close(); });
  dlg.addEventListener('click', e => {
    if (e.target === dlg) { // clique no fundo escuro
      const r = dlg.getBoundingClientRect();
      const dentro = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!dentro) dlg.close();
    }
    if (e.target.closest('[data-fechar]')) dlg.close();
  });
  dlg.addEventListener('close', () => {
    if (dlg.contains(toastEl)) document.body.appendChild(toastEl);
    const o = origemFoco.get(dlg);
    if (o && document.contains(o) && typeof o.focus === 'function') o.focus();
  });
});

/* ---------- Filtros ---------- */
function htmlFiltros(prefixo) {
  return Object.keys(FILTROS).map(k => {
    const multi = k === 'personalidade';
    const botoes = FILTROS[k].map(([v, l, ic]) => {
      const cls = k === 'especie' ? 'chip chip-esp' : multi ? 'chip chip-pers' : 'chip';
      const conteudo = ic ? `${icone(ic, ic === 'i-pata' ? 'pata-fill' : '')}${l}` : l;
      return `<button type="button" class="${cls}" data-k="${k}" data-v="${esc(v)}" aria-pressed="false">${conteudo}</button>`;
    }).join('');
    return `<fieldset class="fgrupo"><legend id="${prefixo}-${k}">${ROTULO_FILTRO[k]}</legend><div class="chips${k === 'especie' ? ' chips-esp' : multi ? ' chips-pers' : ''}">${botoes}</div></fieldset>`;
  }).join('');
}
$$('[data-filtros]').forEach(el => { el.innerHTML = htmlFiltros('f-' + el.dataset.filtros); });

function sincronizarFiltros() {
  $$('.chip').forEach(b => {
    const { k, v } = b.dataset;
    b.setAttribute('aria-pressed', k === 'personalidade' ? estado.personalidade.has(v) : estado[k] === v);
  });
  $$('input[type=search]').forEach(i => { if (i.value !== estado.q) i.value = estado.q; });
  $$('.esp[data-esp]').forEach(a => a.classList.toggle('esp-on', a.dataset.esp === estado.especie));
}
document.addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (!b) return;
  const { k, v } = b.dataset;
  if (k === 'personalidade') estado.personalidade.has(v) ? estado.personalidade.delete(v) : estado.personalidade.add(v);
  else estado[k] = v;
  sincronizarFiltros();
  desenharGrade();
});
function limparFiltros() {
  Object.assign(estado, { q: '', especie: 'todos', porte: 'todos', idade: 'todos' });
  estado.personalidade.clear();
  sincronizarFiltros();
  desenharGrade();
}
$$('[data-limpar]').forEach(b => b.addEventListener('click', () => { limparFiltros(); aviso('Filtros limpos'); }));
$('#filtro-btn').addEventListener('click', () => abrirJanela($('#dlg-filtros')));
$('#aplicar').addEventListener('click', () => {
  const n = filtrar().length;
  aviso(`${n} ${n === 1 ? 'pet encontrado' : 'pets encontrados'}`);
});

function filtrar() {
  const q = semAcento(estado.q.trim());
  return PETS.filter(p =>
    (estado.especie === 'todos' || p.especie === estado.especie) &&
    (estado.porte === 'todos' || p.porte === estado.porte) &&
    (estado.idade === 'todos' || faixaEtaria(p.idade) === estado.idade) &&
    [...estado.personalidade].every(x => p.personalidade.includes(x)) &&
    (!q || semAcento(`${p.nome} ${p.raca} ${NOME_ESPECIE[p.especie] || ''}`).includes(q))
  );
}

/* ---------- Cards de pets ---------- */
function cardPet(p, nivel = 3) {
  const fav = favoritos.has(p.id);
  return `<article class="pet">
    <button type="button" class="fav" data-fav="${esc(p.id)}" aria-pressed="${fav}" aria-label="Favoritar ${esc(p.nome)}">${icone('i-coracao')}</button>
    <div class="foto"><img src="${esc(p.foto)}" alt="${esc(p.alt || p.nome)}" loading="lazy" width="220" height="220"></div>
    <h${nivel}><a class="pet-link" href="#pet/${esc(p.id)}">${esc(p.nome)}</a></h${nivel}>
    <p>${textoIdade(p.idade)} • ${esc(p.porte)}</p>
    <span class="tag">${esc(p.personalidade[0] || '')}</span>
  </article>`;
}

function desenharGrade() {
  const lista = filtrar();
  const n = (estado.especie !== 'todos') + (estado.porte !== 'todos') + (estado.idade !== 'todos') + estado.personalidade.size;
  const badge = $('#badge');
  badge.hidden = !n; badge.textContent = n;
  $('#filtro-btn').setAttribute('aria-label', n ? `Filtros (${n} ativos)` : 'Filtros');
  $('#contagem').textContent = `${lista.length} ${lista.length === 1 ? 'pet encontrado' : 'pets encontrados'}`;
  $('#grade').innerHTML = lista.length
    ? lista.map(p => cardPet(p, 2)).join('')
    : `<div class="vazio"><svg aria-hidden="true"><use href="#i-pata"/></svg><p>Nenhum pet encontrado com esses filtros.</p><button type="button" class="btn btn-o" data-limpar-vazio>Limpar filtros</button></div>`;
}
document.addEventListener('click', e => { if (e.target.closest('[data-limpar-vazio]')) { limparFiltros(); $('#q-animais').focus(); } });

$('#q-animais').addEventListener('input', e => { estado.q = e.target.value; desenharGrade(); });
$('#busca-animais').addEventListener('submit', e => { e.preventDefault(); estado.q = $('#q-animais').value; desenharGrade(); });
$('#busca-inicio').addEventListener('submit', e => {
  e.preventDefault();
  estado.q = $('#q-inicio').value;
  sincronizarFiltros(); desenharGrade();
  location.hash = 'animais';
});
$$('.esp[data-esp]').forEach(a => a.addEventListener('click', () => {
  estado.especie = a.dataset.esp;
  sincronizarFiltros(); desenharGrade();
}));

/* ---------- Favoritos ---------- */
function atualizarFavoritos() {
  armazenar.gravar('fc-favoritos', [...favoritos]);
  const c = $('#fav-cont');
  c.hidden = !favoritos.size;
  c.textContent = favoritos.size;
  c.setAttribute('aria-label', `${favoritos.size} favoritos`);
  $$('[data-fav]').forEach(b => b.setAttribute('aria-pressed', favoritos.has(b.dataset.fav)));
  if (paginaAtual === 'minha-area') desenharMinhaArea();
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-fav]');
  if (!b) return;
  const id = b.dataset.fav, p = PETS.find(x => x.id === id);
  if (favoritos.has(id)) { favoritos.delete(id); aviso(`${p.nome} saiu dos favoritos`); }
  else { favoritos.add(id); aviso(`${p.nome} foi para os favoritos`); }
  atualizarFavoritos();
});

/* ---------- Carrossel da página inicial ---------- */
function desenharCarrossel() {
  const c = $('#carrossel');
  c.innerHTML = PETS.slice(0, 8).map(p => cardPet(p)).join('');
  $('#pontos').innerHTML = PETS.slice(0, 8).map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('');
  c.addEventListener('scroll', () => {
    const card = c.firstElementChild; if (!card) return;
    const passo = card.getBoundingClientRect().width + 14;
    const max = c.scrollWidth - c.clientWidth;
    const i = c.scrollLeft >= max - 4 ? PETS.length - 1 : Math.round(c.scrollLeft / passo);
    $$('#pontos i').forEach((d, k) => d.classList.toggle('on', k === Math.min(i, 7)));
  }, { passive: true });
}

/* ---------- Detalhes do pet ---------- */
const dlgPet = $('#dlg-pet');
let petAberto = null, voltarAoFechar = false, fechandoPorRota = false;

function linhaDado(ic, rotulo, valor) {
  return `<div><dt>${icone(ic)}${rotulo}</dt><dd>${esc(valor)}</dd></div>`;
}
function abrirPet(id) {
  const p = PETS.find(x => x.id === id);
  if (!p) { aviso('Pet não encontrado'); history.replaceState(null, '', '#animais'); mostrarPagina('animais'); return; }
  petAberto = p;
  if (dlgPet.contains(toastEl)) document.body.appendChild(toastEl);
  const fav = favoritos.has(p.id);
  dlgPet.innerHTML = `
    <div class="pet-cab">
      <button type="button" class="icone-btn" data-fechar aria-label="Fechar detalhes">${icone('i-voltar')}</button>
      <p class="f" style="font-size:22px;font-weight:600" aria-hidden="true">Detalhes do Pet</p>
      <button type="button" class="icone-btn" data-fav="${esc(p.id)}" aria-pressed="${fav}" aria-label="Favoritar ${esc(p.nome)}">${icone('i-coracao')}</button>
    </div>
    <div class="pet-corpo">
      <div>
        <div class="pet-foto-w">
          <div class="foto"><img src="${esc(p.foto)}" alt="${esc(p.alt || p.nome)}" width="380" height="380"></div>
          <svg class="deco-pata p1" aria-hidden="true"><use href="#i-pata"/></svg>
          <svg class="deco-pata p2" aria-hidden="true"><use href="#i-pata"/></svg>
          <svg class="deco-pata p3" aria-hidden="true"><use href="#i-pata"/></svg>
        </div>
        <h2 class="pet-nome" id="pet-nome">${esc(p.nome)} ${icone('i-coracao')}</h2>
        <p class="pet-meta">${textoIdade(p.idade)} • Porte ${esc(p.porte)}</p>
        <div class="tags">${p.personalidade.map(x => `<span class="tag f" style="font-weight:600">${esc(x)}</span>`).join('')}</div>
      </div>
      <div class="pet-info">
        <h3>Sobre ${artigo(p)} ${esc(p.nome)}</h3>
        <p>${esc(p.sobre)}</p>
        <dl class="pet-dados">
          ${linhaDado('i-pata', 'Raça', p.raca)}
          ${linhaDado(ehFemea(p) ? 'i-femea' : 'i-sexo', 'Sexo', p.sexo)}
          ${linhaDado('i-peso', 'Peso', p.peso)}
          ${linhaDado('i-local', 'Localização', p.localizacao)}
        </dl>
        <div class="pet-acoes">
          <a class="btn" id="quero-adotar" href="${whatsLink(`Olá! Tenho interesse em adotar ${artigo(p)} ${p.nome}`)}" target="_blank" rel="noopener">${icone('i-whats')}Quero adotar<span class="sr"> (abre o WhatsApp em nova aba)</span></a>
          <button type="button" class="btn btn-o" id="compartilhar">${icone('i-compartilhar')}Compartilhar</button>
        </div>
      </div>
    </div>`;
  $('.pet-cab .icone-btn', dlgPet).setAttribute('autofocus', '');
  $('#compartilhar', dlgPet).addEventListener('click', () => compartilharPet(p));
  document.title = `${p.nome} – Focinho Certo`;
  abrirJanela(dlgPet);
}

async function compartilharPet(p) {
  const url = `${location.origin}${location.pathname}#pet/${p.id}`;
  const dados = { title: `${p.nome} – Focinho Certo`, text: `Conheça ${artigo(p)} ${p.nome}, que está esperando por um lar no Focinho Certo!`, url };
  if (typeof navigator.share === 'function') {
    try { await navigator.share(dados); return; }
    catch (e) { if (e && e.name === 'AbortError') return; /* falhou: copia o link */ }
  }
  const ok = await copiarTexto(url);
  aviso(ok ? 'Link copiado' : `Copie o link: ${url}`);
}

dlgPet.addEventListener('close', () => {
  petAberto = null;
  if (fechandoPorRota) { fechandoPorRota = false; return; }
  // Volta a URL para a página de onde a janela foi aberta
  if (voltarAoFechar) { voltarAoFechar = false; ignorarProximaRota = true; history.back(); }
  else history.replaceState(null, '', '#' + (paginaAtual || 'animais'));
  document.title = TITULOS[paginaAtual] || TITULOS.inicio;
});

/* ---------- Quiz ---------- */
const PERGUNTAS = [
  { t: 'Qual seu estilo de vida?', o: [
    { t: 'Prefiro momentos em casa', img: 'img/quiz/casa.png', p: { Calmo: 2, Dócil: 1, gato: 1 } },
    { t: 'Gosto de atividades ao ar livre', img: 'img/quiz/ar-livre.png', p: { Ativo: 3, Brincalhão: 2, cao: 2 } },
    { t: 'Rotina agitada', img: 'img/quiz/agenda.png', p: { Curioso: 2, gato: 2, outro: 1 } },
    { t: 'Tranquilo e relaxado', img: 'img/quiz/sofa.png', p: { Calmo: 3, Tímido: 2, outro: 1 } }
  ] },
  { t: 'Quanto espaço você tem em casa?', o: [
    { t: 'Apartamento pequeno', ic: 'i-predio', p: { Pequeno: 2, gato: 2, outro: 2 } },
    { t: 'Apartamento amplo', ic: 'i-predio', p: { Pequeno: 1, Médio: 2 } },
    { t: 'Casa sem quintal', ic: 'i-casa', p: { Pequeno: 1, Médio: 1, cao: 1 } },
    { t: 'Casa com quintal', ic: 'i-arvore', p: { Grande: 3, Médio: 2, cao: 2 } }
  ] },
  { t: 'Quanto tempo livre você tem por dia?', o: [
    { t: 'Menos de 1 hora', ic: 'i-relogio', p: { gato: 2, outro: 2, Calmo: 1 } },
    { t: 'De 1 a 3 horas', ic: 'i-relogio', p: { Dócil: 2, Sociável: 1, Curioso: 1 } },
    { t: 'Mais de 3 horas', ic: 'i-sol', p: { Ativo: 2, Brincalhão: 2, cao: 2 } },
    { t: 'Trabalho em casa', ic: 'i-casa', p: { Sociável: 2, Dócil: 1, Calmo: 1 } }
  ] },
  { t: 'Quem mora com você?', o: [
    { t: 'Moro sozinho(a)', ic: 'i-sozinho', p: { Curioso: 1, Calmo: 1, gato: 1 } },
    { t: 'Família com crianças', ic: 'i-familia', p: { Brincalhão: 2, Sociável: 2, Dócil: 2 } },
    { t: 'Tenho outros pets', ic: 'i-cao', p: { Sociável: 3 } },
    { t: 'Casal ou amigos', ic: 'i-coracao', p: { Sociável: 1, Ativo: 1, Dócil: 1 } }
  ] },
  { t: 'Que tipo de companhia você procura?', o: [
    { t: 'Parceiro de aventuras', ic: 'i-bussola', p: { Ativo: 3, Brincalhão: 1, cao: 1 } },
    { t: 'Carinho e calma', ic: 'i-coracao', p: { Calmo: 2, Dócil: 2 } },
    { t: 'Alguém curioso e independente', ic: 'i-gato', p: { Curioso: 3, gato: 2 } },
    { t: 'Um bichinho delicado', ic: 'i-coelho', p: { Tímido: 3, outro: 3 } }
  ] }
];
const quiz = { passo: -1, respostas: [], ranking: [], mostrando: 0 };
const quizBox = $('#quiz-box');

function atributos(p) { return [...p.personalidade, p.especie, p.porte]; }
function pontosPet(p, opcao) { return atributos(p).reduce((s, a) => s + (opcao.p[a] || 0), 0); }

function focarQuiz() {
  window.scrollTo(0, 0);
  $('#t-quiz').focus({ preventScroll: true });
}

function quizIntro() {
  quiz.passo = -1; quiz.respostas = [];
  quizBox.innerHTML = `<div class="quiz-intro">
    <h1 id="t-quiz" tabindex="-1">Quiz de<br>Compatibilidade</h1>
    <img src="img/quiz/cao-gato.png" alt="Ilustração de um cachorro e um gato sentados lado a lado em frente a um coração" width="340" height="300">
    <p class="sub">Responda algumas perguntas e encontramos o pet ideal para você e seu estilo de vida!</p>
    <ul class="lista-ic">
      <li>${icone('i-relogio')}Rápido e divertido</li>
      <li>${icone('i-pulso')}Resultado personalizado</li>
      <li>${icone('i-coracao')}Ajuda pets a encontrarem o lar certo</li>
    </ul>
    <button type="button" class="btn" id="comecar-quiz">Começar Quiz</button>
  </div>`;
  $('#comecar-quiz').addEventListener('click', () => quizPergunta(0, true));
}

function quizPergunta(i, focar) {
  quiz.passo = i;
  const q = PERGUNTAS[i], escolhida = quiz.respostas[i];
  const ultima = i === PERGUNTAS.length - 1;
  quizBox.innerHTML = `<div class="quiz-q">
    <div class="quiz-topo">
      <button type="button" class="icone-btn" id="quiz-voltar" aria-label="${i ? 'Pergunta anterior' : 'Voltar para o início do quiz'}">${icone('i-voltar')}</button>
      <div class="progresso" role="progressbar" aria-valuemin="1" aria-valuemax="${PERGUNTAS.length}" aria-valuenow="${i + 1}" aria-label="Pergunta ${i + 1} de ${PERGUNTAS.length}">
        ${PERGUNTAS.map((_, k) => `<i class="${k <= i ? 'on' : ''}${k === i ? ' atual' : ''}"></i>`).join('')}
      </div><span></span>
    </div>
    <h1 id="t-quiz" tabindex="-1">${q.t}</h1>
    <p class="passo-txt">Pergunta ${i + 1} de ${PERGUNTAS.length}</p>
    <div class="opcoes" role="group" aria-labelledby="t-quiz">
      ${q.o.map((o, k) => `<button type="button" class="opcao" data-op="${k}" aria-pressed="${escolhida === k}">
        ${o.img ? `<img src="${o.img}" alt="" width="120" height="110">` : `<svg aria-hidden="true"><use href="#${o.ic}"/></svg>`}
        <span>${o.t}</span></button>`).join('')}
    </div>
    <button type="button" class="btn" id="quiz-proxima" aria-disabled="${escolhida === undefined}">${ultima ? 'Ver resultado' : 'Próxima'}</button>
  </div>`;
  $$('.opcao', quizBox).forEach(b => b.addEventListener('click', () => {
    quiz.respostas[i] = +b.dataset.op;
    $$('.opcao', quizBox).forEach(x => x.setAttribute('aria-pressed', x === b));
    $('#quiz-proxima').setAttribute('aria-disabled', 'false');
  }));
  $('#quiz-proxima').addEventListener('click', () => {
    if (quiz.respostas[i] === undefined) { aviso('Escolha uma opção para continuar'); return; }
    ultima ? quizResultado() : quizPergunta(i + 1, true);
  });
  $('#quiz-voltar').addEventListener('click', () => (i ? quizPergunta(i - 1, true) : quizIntro(), focarQuiz()));
  if (focar) focarQuiz();
}

function quizResultado() {
  const escolhas = quiz.respostas.map((k, i) => PERGUNTAS[i].o[k]);
  const maximo = escolhas.reduce((s, o) => s + Math.max(...PETS.map(p => pontosPet(p, o))), 0) || 1;
  quiz.ranking = PETS.map(p => {
    const pts = escolhas.reduce((s, o) => s + pontosPet(p, o), 0);
    return { p, pct: Math.min(98, Math.round(50 + 48 * pts / maximo)) };
  }).sort((a, b) => b.pct - a.pct);
  quiz.mostrando = 0;
  mostrarMatch(true);
}

function mostrarMatch(focar) {
  const { p, pct } = quiz.ranking[quiz.mostrando];
  const pers = p.personalidade.map(x => x.toLowerCase());
  const tracos = pers.length > 1 ? `${pers.slice(0, -1).join(', ')} e ${pers.at(-1)}` : pers[0];
  const adj = s => (ehFemea(p) ? s.replace(/o\b/g, 'a').replace(/ão\b/, 'ona') : s);
  const primeiro = quiz.mostrando === 0;
  if (primeiro) armazenar.gravar('fc-quiz', { id: p.id, pct, data: new Date().toISOString() });
  quizBox.innerHTML = `<div class="resultado">
    <h1 id="t-quiz" tabindex="-1">${primeiro ? 'Seu match ideal é…' : `Seu ${quiz.mostrando + 1}º match é…`} ${icone('i-coracao')}</h1>
    <div class="foto"><img src="${esc(p.foto)}" alt="${esc(p.alt || p.nome)}" width="360" height="360"></div>
    <h2>${esc(p.nome)}</h2>
    <span class="pct">${pct}% de compatibilidade</span>
    <p class="txt">Vocês combinam! ${esc(p.nome)} é ${adj(tracos)} e vai ser ${ehFemea(p) ? 'a parceira perfeita' : 'o parceiro perfeito'} para os seus dias.</p>
    <div class="acoes">
      <a class="btn" href="#pet/${esc(p.id)}">Ver perfil ${ehFemea(p) ? 'dela' : 'dele'}</a>
      <button type="button" class="btn btn-o" id="outros-matches">${icone('i-atualizar')}Ver outros matches</button>
    </div>
    <button type="button" class="refazer" id="refazer">Refazer o quiz</button>
  </div>`;
  $('#outros-matches').addEventListener('click', () => {
    quiz.mostrando = (quiz.mostrando + 1) % quiz.ranking.length;
    mostrarMatch(true);
  });
  $('#refazer').addEventListener('click', () => { quizIntro(); focarQuiz(); });
  if (focar) focarQuiz();
}

/* ---------- Planos de saúde ---------- */
const PLANOS = [
  { id: 'bronze', nome: 'Bronze', desc: 'Cuidados essenciais para o dia a dia.', preco: '49,90', de: '62,40', off: 20,
    itens: ['Consultas', 'Vacinas básicas', 'Exames simples'] },
  { id: 'prata', nome: 'Prata', desc: 'Mais proteção e tranquilidade.', preco: '79,90', de: '106,53', off: 25,
    itens: ['Consultas', 'Vacinas', 'Exames laboratoriais', 'Descontos em medicamentos'] },
  { id: 'ouro', nome: 'Ouro', desc: 'Cobertura completa para todas as fases.', preco: '129,90', de: '185,57', off: 30,
    itens: ['Consultas', 'Vacinas', 'Exames laboratoriais', 'Internações', 'Cirurgias', 'Descontos em medicamentos'] }
];
$('#planos-lista').innerHTML = PLANOS.map(pl => `<article class="plano ${pl.id}">
  <div class="plano-cab"><span class="selo" aria-hidden="true"><svg><use href="#i-escudo"/></svg></span>
    <div><h3>${pl.nome}</h3><p>${pl.desc}</p></div></div>
  <div class="plano-preco">
    <div><b>R$ ${pl.preco}<small>/mês</small></b><span class="de">com ${pl.off}% de desconto</span><span class="de">antes <s>R$ ${pl.de}</s></span></div>
    <span class="off">${pl.off}% OFF</span>
  </div>
  <ul>${pl.itens.map(x => `<li>${icone('i-check')}${x}</li>`).join('')}</ul>
  <a class="btn btn-bloco" href="${whatsLink(`Olá! Tenho interesse no Plano ${pl.nome} do Focinho Certo`)}" target="_blank" rel="noopener">${icone('i-whats')}Tenho interesse<span class="sr"> no Plano ${pl.nome} (abre o WhatsApp em nova aba)</span></a>
</article>`).join('');

/* ---------- Cupom ---------- */
$('#copiar-cupom').addEventListener('click', async () => {
  const ok = await copiarTexto(CUPOM);
  const rot = $('#copiar-cupom span');
  if (ok) {
    rot.textContent = 'Copiado!';
    aviso('Cupom copiado!');
    setTimeout(() => { rot.textContent = 'Copiar'; }, 2500);
  } else aviso(`Não foi possível copiar. Anote o cupom: ${CUPOM}`);
});

/* ---------- Minha área ---------- */
$('#ajuda-link').href = whatsLink('Olá! Preciso de ajuda com o Focinho Certo');
$('#ajuda-link').insertAdjacentHTML('beforeend', '<span class="sr"> (abre o WhatsApp em nova aba)</span>');
function desenharMinhaArea() {
  const favs = PETS.filter(p => favoritos.has(p.id));
  $('#favoritos').innerHTML = favs.length ? favs.map(p => cardPet(p)).join('')
    : `<div class="vazio"><svg aria-hidden="true"><use href="#i-pata"/></svg><p>Você ainda não favoritou nenhum pet. Toque no coração de um bichinho para guardá-lo aqui.</p><a class="btn" href="#animais">Ver animais</a></div>`;
  const r = armazenar.ler('fc-quiz', null), p = r && PETS.find(x => x.id === r.id);
  $('#ultimo-quiz').innerHTML = p
    ? `<div class="ultimo"><div class="foto"><img src="${esc(p.foto)}" alt="${esc(p.alt || p.nome)}" width="76" height="76"></div>
       <div><strong class="f" style="font-size:20px">${esc(p.nome)}</strong><br>${r.pct}% de compatibilidade<br><a href="#pet/${esc(p.id)}">Ver perfil</a> · <a href="#quiz">Refazer</a></div></div>`
    : `<p>Você ainda não fez o quiz.</p><a class="btn" style="margin-top:12px" href="#quiz">Fazer Quiz</a>`;
}

/* ---------- Rotas (páginas) ---------- */
const PAGINAS = ['inicio', 'animais', 'quiz', 'beneficios', 'minha-area'];
const TITULOS = {
  inicio: 'Focinho Certo – Adote um pet',
  animais: 'Animais para adoção – Focinho Certo',
  quiz: 'Quiz de Compatibilidade – Focinho Certo',
  beneficios: 'Benefícios – Focinho Certo',
  'minha-area': 'Minha área – Focinho Certo'
};
let paginaAtual = null, ignorarProximaRota = false;

function mostrarPagina(pag, { focar = true, ancora = null } = {}) {
  const mudou = pag !== paginaAtual;
  paginaAtual = pag;
  $$('.pagina').forEach(s => { s.hidden = s.dataset.page !== pag; });
  $$('[data-nav]').forEach(a => a.dataset.nav === pag ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  document.title = TITULOS[pag];
  if (pag === 'minha-area') desenharMinhaArea();
  if (pag === 'quiz' && mudou && quiz.passo === -1) quizIntro();
  const alvo = ancora && document.getElementById(ancora);
  if (alvo) {
    alvo.scrollIntoView({ block: 'start' });
    const h = $('h2', alvo); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  } else if (mudou || focar) {
    window.scrollTo(0, 0);
    const h1 = $(`[data-page="${pag}"] h1`);
    if (focar && h1) h1.focus({ preventScroll: true });
  }
}

function rotear() {
  if (ignorarProximaRota) { ignorarProximaRota = false; return; }
  const hash = decodeURIComponent(location.hash.slice(1));
  const [pag, sub] = hash.split('/');
  if (pag === 'pet' && sub) {
    if (!paginaAtual) mostrarPagina('animais', { focar: false });
    abrirPet(sub);
    return;
  }
  if (dlgPet.open) { fechandoPorRota = true; dlgPet.close(); }
  if (!hash || PAGINAS.includes(pag)) {
    mostrarPagina(pag || 'inicio', { ancora: sub, focar: paginaAtual !== null });
    return;
  }
  // Âncora dentro da página (ex.: #sobre, #conteudo)
  const el = document.getElementById(hash);
  if (!paginaAtual) mostrarPagina('inicio', { focar: false });
  if (el) { el.scrollIntoView(); el.focus({ preventScroll: true }); }
}

// Links para #pet/... abertos de dentro do site devem voltar à página anterior ao fechar
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#pet/"]');
  if (a && !e.ctrlKey && !e.metaKey && !e.shiftKey) voltarAoFechar = true;
});
$('.pular').addEventListener('click', e => { e.preventDefault(); const m = $('#conteudo'); m.focus(); m.scrollIntoView(); });
window.addEventListener('hashchange', rotear);

/* ---------- Início ---------- */
async function iniciar() {
  try {
    const r = await fetch(ARQUIVO_PETS, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    PETS = await r.json();
  } catch (e) {
    console.warn('Não foi possível carregar os pets:', e);
    $('#grade').innerHTML = $('#carrossel').innerHTML = '<p class="vazio">Não foi possível carregar os pets agora. Tente recarregar a página.</p>';
  }
  for (const id of [...favoritos]) if (!PETS.some(p => p.id === id)) favoritos.delete(id);
  desenharCarrossel();
  sincronizarFiltros();
  desenharGrade();
  atualizarFavoritos();
  rotear();
  if (!location.hash) $$('[data-nav]')[0].setAttribute('aria-current', 'page');
}
iniciar();
