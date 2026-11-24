/* =========================================================
   Focinho Certo – site de adoção de pets
   ========================================================= */

// ▼ Número do WhatsApp que recebe os contatos (DDI + DDD + número, só dígitos)
const WHATSAPP_NUMERO = '5511957058468';

const CUPOM = 'FOCINHOCERTO';
const ARQUIVO_PETS = 'data/pets.json';
const ARQUIVO_PARCEIROS = 'data/parceiros.json';

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
function cardPet(p, nivel = 3, maisPerto = false) {
  const fav = favoritos.has(p.id);
  return `<article class="pet${maisPerto ? ' pet-perto' : ''}">
    ${maisPerto ? `<span class="selo-perto">${icone('i-local', 'ic ic-s')}Mais perto de você</span>` : ''}
    <button type="button" class="fav" data-fav="${esc(p.id)}" aria-pressed="${fav}" aria-label="Favoritar ${esc(p.nome)}">${icone('i-coracao')}</button>
    <div class="foto"><img src="${esc(p.foto)}" alt="${esc(p.alt || p.nome)}" loading="lazy" width="220" height="220"></div>
    <h${nivel}><a class="pet-link" href="#pet/${esc(p.id)}">${esc(p.nome)}</a></h${nivel}>
    <p>${textoIdade(p.idade)} • ${esc(p.porte)}</p>
    ${p.bairro ? `<p class="pet-local">${icone('i-local', 'ic ic-s')}<span>${esc(textoLocal(p))}</span></p>` : ''}
    <span class="tag">${esc(p.personalidade[0] || '')}</span>
  </article>`;
}

function desenharGrade() {
  const lista = ordenarPorDistancia(filtrar());
  const n = (estado.especie !== 'todos') + (estado.porte !== 'todos') + (estado.idade !== 'todos') + estado.personalidade.size;
  const badge = $('#badge');
  badge.hidden = !n; badge.textContent = n;
  $('#filtro-btn').setAttribute('aria-label', n ? `Filtros (${n} ativos)` : 'Filtros');
  $('#contagem').textContent = `${lista.length} ${lista.length === 1 ? 'pet encontrado' : 'pets encontrados'}${local && lista.length > 1 ? ', do mais perto para o mais longe' : ''}`;
  $('#grade').innerHTML = lista.length
    ? lista.map((p, i) => cardPet(p, 2, Boolean(local) && i === 0)).join('')
    : `<div class="vazio"><svg aria-hidden="true"><use href="#i-pata"/></svg><p>Nenhum pet encontrado com esses filtros.</p><button type="button" class="btn btn-o" data-limpar-vazio>Limpar filtros</button></div>`;
  atualizarMapaPets(lista);
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

/* ---------- Localização, distâncias e mapas ---------- */
// A localização da pessoa fica só na memória desta página: não é salva nem enviada a servidores.
// Endereços digitados são consultados no ViaCEP (CEP) e no Nominatim/OpenStreetMap (coordenadas).
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const VIACEP_URL = 'https://viacep.com.br/ws/';
const INTERVALO_NOMINATIM_MS = 1100; // política do Nominatim: no máximo 1 requisição por segundo
const RAIO_PET_M = 700;              // círculo aproximado em volta do centro do bairro
const CENTRO_PADRAO = [-23.55, -46.63]; // São Paulo
let PARCEIROS = [];
let local = null; // { lat, lon, rotulo }

function distanciaKm(a, b) {
  const la1 = a.lat ?? a.latitude, lo1 = a.lon ?? a.longitude, la2 = b.lat ?? b.latitude, lo2 = b.lon ?? b.longitude;
  const rad = x => x * Math.PI / 180, R = 6371;
  const dLa = rad(la2 - la1), dLo = rad(lo2 - lo1);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const textoDistancia = km => (km < 1 ? 'a menos de 1 km' : `a ${Math.round(km).toLocaleString('pt-BR')} km`);
const cidadeDe = x => String(x.localizacao || x.cidade || '').split(' - ')[0];
// "Pinheiros · a 3 km"; acima de 30 km inclui a cidade: "Cambuí, Campinas · a 87 km"
function textoLocal(x) {
  if (!local) return `${x.bairro}, ${cidadeDe(x)}`;
  const km = distanciaKm(local, x);
  return `${km > 30 ? `${x.bairro}, ${cidadeDe(x)}` : x.bairro} · ${textoDistancia(km)}`;
}
function ordenarPorDistancia(lista) {
  if (!local) return lista;
  return [...lista].sort((a, b) => distanciaKm(local, a) - distanciaKm(local, b));
}

/* Consultas externas */
let filaNominatim = Promise.resolve(), ultimaNominatim = 0;
const cacheGeo = new Map();
function consultarNominatim(q) {
  const chave = semAcento(q.trim());
  if (cacheGeo.has(chave)) return cacheGeo.get(chave);
  const pedido = filaNominatim.then(async () => {
    const espera = ultimaNominatim + INTERVALO_NOMINATIM_MS - Date.now();
    if (espera > 0) await new Promise(ok => setTimeout(ok, espera));
    ultimaNominatim = Date.now();
    const params = new URLSearchParams({ q, format: 'jsonv2', limit: '1', countrycodes: 'br', addressdetails: '1', 'accept-language': 'pt-BR' });
    const r = await fetch(`${NOMINATIM_URL}?${params}`);
    if (!r.ok) throw new Error('Nominatim ' + r.status);
    const [res] = await r.json();
    return res ? { lat: Number(res.lat), lon: Number(res.lon), endereco: res.address || {}, nome: res.display_name || q } : null;
  });
  filaNominatim = pedido.catch(() => {});
  cacheGeo.set(chave, pedido);
  pedido.catch(() => cacheGeo.delete(chave));
  return pedido;
}
async function consultarCep(cep) {
  const r = await fetch(`${VIACEP_URL}${cep}/json/`);
  if (!r.ok) throw new Error('ViaCEP ' + r.status);
  const j = await r.json();
  return j.erro ? null : j;
}
class ErroBusca extends Error {}
async function buscarEndereco(texto) {
  const limpo = texto.trim();
  if (/^\d{5}-?\d{3}$/.test(limpo)) {
    const e = await consultarCep(limpo.replace(/\D/g, ''));
    if (!e) throw new ErroBusca('CEP não encontrado. Confira os números ou digite o nome do bairro.');
    const tentativas = [[e.logradouro, e.bairro, e.localidade, e.uf], [e.bairro, e.localidade, e.uf], [e.localidade, e.uf]]
      .map(l => l.filter(Boolean).join(', ')).filter((v, i, a) => v && a.indexOf(v) === i);
    for (const q of tentativas) {
      const res = await consultarNominatim(q);
      if (res) return { lat: res.lat, lon: res.lon, rotulo: [e.bairro, e.localidade].filter(Boolean).join(', ') };
    }
    throw new ErroBusca('Encontramos o CEP, mas não conseguimos marcá-lo no mapa. Tente digitar o bairro e a cidade.');
  }
  const res = await consultarNominatim(limpo);
  if (!res) throw new ErroBusca('Não encontramos esse endereço. Tente incluir o bairro e a cidade (ex.: Pinheiros, São Paulo).');
  const a = res.endereco;
  const bairro = a.suburb || a.neighbourhood || a.quarter || a.city_district;
  const cidade = a.city || a.town || a.village || a.municipality;
  return { lat: res.lat, lon: res.lon, rotulo: [bairro, cidade].filter(Boolean).join(', ') || res.nome.split(',').slice(0, 2).join(',') };
}

/* Formulários de localização (Animais e Banho & Tosa compartilham o mesmo estado) */
$$('[data-localizador]').forEach(el => {
  const id = el.dataset.localizador;
  el.innerHTML = `
    <div class="loc-acoes">
      <button type="button" class="btn btn-o loc-gps" data-usar-local>${icone('i-mira')}Usar minha localização</button>
      <span class="loc-ou" aria-hidden="true">ou</span>
      <form class="loc-busca" data-busca-local novalidate>
        <label class="sr" for="end-${id}">Rua, bairro ou CEP</label>
        <input id="end-${id}" type="text" placeholder="Rua, bairro ou CEP" autocomplete="off" enterkeyhint="search">
        <button type="submit" class="btn">Buscar</button>
      </form>
    </div>
    <p class="loc-status" role="status" aria-live="polite"></p>
    <p class="loc-nota">Sua localização fica só no seu navegador. Endereços digitados são consultados no ViaCEP e no OpenStreetMap.</p>`;
});
function statusLocal(html, tipo = '') {
  $$('.loc-status').forEach(p => { p.innerHTML = html; p.className = `loc-status ${tipo}`; });
}
function definirLocal(novo) {
  local = novo;
  if (local) statusLocal(`${icone('i-local', 'ic ic-s')}<span>Distâncias a partir de <strong>${esc(local.rotulo)}</strong>.</span> <button type="button" class="link-btn" data-limpar-local>Remover</button>`, 'ok');
  else statusLocal('');
  desenharGrade();
  desenharParceiros();
  if (dlgPet.open && petAberto) abrirPet(petAberto.id);
}
function usarLocalizacao(origem) {
  const campo = $('input', origem.closest('[data-localizador]'));
  if (!('geolocation' in navigator)) {
    statusLocal('Seu navegador não informa a localização. Digite seu bairro ou CEP para ver os pets mais perto.', 'erro');
    campo.focus();
    return;
  }
  statusLocal('Pedindo sua localização…');
  navigator.geolocation.getCurrentPosition(
    pos => definirLocal({ lat: pos.coords.latitude, lon: pos.coords.longitude, rotulo: 'sua localização atual' }),
    err => {
      statusLocal(err.code === 1
        ? 'Tudo bem! Sem a sua localização, você pode digitar seu bairro ou CEP para ver os pets mais perto.'
        : 'Não conseguimos descobrir sua localização agora. Tente digitar seu bairro ou CEP.', 'erro');
      campo.focus();
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
  );
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-usar-local]');
  if (b) usarLocalizacao(b);
  if (e.target.closest('[data-limpar-local]')) { definirLocal(null); aviso('Localização removida'); }
});
document.addEventListener('submit', async e => {
  const form = e.target.closest('[data-busca-local]');
  if (!form) return;
  e.preventDefault();
  const campo = $('input', form), botao = $('button', form), texto = campo.value.trim();
  if (texto.length < 3) { statusLocal('Digite uma rua, um bairro ou um CEP (8 números).', 'erro'); campo.focus(); return; }
  botao.disabled = true; botao.setAttribute('aria-busy', 'true');
  statusLocal('Buscando endereço…');
  try {
    definirLocal(await buscarEndereco(texto));
    $$('[data-busca-local] input').forEach(i => { i.value = texto; });
  } catch (erro) {
    statusLocal(erro instanceof ErroBusca ? esc(erro.message) : 'Não foi possível buscar agora. Verifique sua conexão e tente de novo.', 'erro');
  } finally {
    botao.disabled = false; botao.removeAttribute('aria-busy');
  }
});

/* Mapas (Leaflet + OpenStreetMap) */
const temLeaflet = () => typeof window.L !== 'undefined';
const mapas = {};
const visivel = el => el && el.getClientRects().length > 0;
function criarMapa(el) {
  if (!temLeaflet()) {
    el.innerHTML = '<p class="mapa-falha">Não foi possível carregar o mapa agora. A lista continua mostrando as distâncias.</p>';
    return null;
  }
  // Com "movimento reduzido" o CSS desliga as transições; o Leaflet precisa saber, senão o zoom trava
  const animar = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const m = L.map(el, { zoomControl: false, scrollWheelZoom: false, center: CENTRO_PADRAO, zoom: 11,
    zoomAnimation: animar, fadeAnimation: animar, markerZoomAnimation: animar });
  L.control.zoom({ zoomInTitle: 'Aproximar', zoomOutTitle: 'Afastar' }).addTo(m);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; colaboradores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(m);
  m.camada = L.layerGroup().addTo(m);
  return m;
}
function mapaPronto(id) {
  const el = document.getElementById(id);
  if (!visivel(el)) return null;
  if (!(id in mapas)) mapas[id] = criarMapa(el);
  const m = mapas[id];
  if (m) m.invalidateSize();
  return m;
}
function marcadorVoce(m) {
  if (!local) return null;
  return L.marker([local.lat, local.lon], {
    icon: L.divIcon({ className: '', html: '<span class="pin-voce"></span>', iconSize: [22, 22], iconAnchor: [11, 11] }),
    title: `Você: ${local.rotulo}`, keyboard: false, zIndexOffset: 1000
  }).bindTooltip('Você está aqui', { direction: 'top', offset: [0, -10] }).addTo(m.camada);
}
function enquadrar(m, pontos) {
  if (local && pontos.length) {
    // com localização: enquadra a pessoa e o que está a até 30 km (ou o mais próximo, se nada estiver tão perto)
    const dist = pt => distanciaKm(local, { lat: pt[0], lon: pt[1] });
    const perto = pontos.filter(pt => dist(pt) <= 30);
    pontos = perto.length ? perto : [pontos.reduce((a, b) => (dist(a) <= dist(b) ? a : b))];
  }
  if (local) pontos = [...pontos, [local.lat, local.lon]];
  if (!pontos.length) return m.setView(CENTRO_PADRAO, 11);
  if (pontos.length === 1) return m.setView(pontos[0], 13, { animate: false });
  m.fitBounds(pontos, { padding: [36, 36], maxZoom: 13, animate: false });
}
let ultimaListaMapa = [];
function atualizarMapaPets(lista = ultimaListaMapa) {
  ultimaListaMapa = lista;
  const m = mapaPronto('mapa-pets');
  if (!m) return;
  m.camada.clearLayers();
  lista.forEach((p, i) => {
    if (typeof p.latitude !== 'number') return;
    const perto = Boolean(local) && i === 0;
    L.circle([p.latitude, p.longitude], {
      radius: RAIO_PET_M, color: perto ? '#0f5f4c' : '#c0544b', weight: 2, dashArray: '4 4',
      fillColor: '#f4b4ae', fillOpacity: 0.35, interactive: false
    }).addTo(m.camada);
    const rotulo = `${p.nome} – ${textoLocal(p)}${perto ? ' (mais perto de você)' : ''}`;
    const mk = L.marker([p.latitude, p.longitude], {
      icon: L.divIcon({ className: '', html: `<span class="pin-pet${perto ? ' pin-perto' : ''}"><img src="${esc(p.foto)}" alt=""></span>`, iconSize: [48, 48], iconAnchor: [24, 24] }),
      title: rotulo, alt: rotulo, riseOnHover: true
    }).bindTooltip(esc(rotulo), { direction: 'top', offset: [0, -24] });
    const abrir = () => { voltarAoFechar = true; location.hash = 'pet/' + p.id; };
    mk.on('click', abrir);
    mk.addTo(m.camada);
    const el = mk.getElement();
    if (el) {
      el.setAttribute('aria-label', `${rotulo}. Abrir detalhes`);
      el.classList.add('mapa-pet', 'mapa-pet-' + p.id);
      // o Leaflet 1.9 só trata Enter em marcadores com popup; role="button" também deve responder a Espaço
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
    }
  });
  marcadorVoce(m);
  enquadrar(m, lista.filter(p => typeof p.latitude === 'number').map(p => [p.latitude, p.longitude]));
}

const PIN_PARCEIRO = '<svg viewBox="0 0 32 42" width="32" height="42" aria-hidden="true"><path d="M16 41S3 26 3 15a13 13 0 0126 0c0 11-13 26-13 26z" fill="#0f5f4c" stroke="#fff" stroke-width="2"/><circle cx="16" cy="15" r="5.5" fill="#f4b4ae"/></svg>';
function atualizarMapaParceiros(lista) {
  const m = mapaPronto('mapa-parceiros');
  if (!m) return;
  m.camada.clearLayers();
  lista.forEach(pc => {
    const rotulo = `${pc.nome} – ${textoLocal(pc)}`;
    const mk = L.marker([pc.latitude, pc.longitude], {
      icon: L.divIcon({ className: 'pin-parceiro', html: PIN_PARCEIRO, iconSize: [32, 42], iconAnchor: [16, 41], popupAnchor: [0, -36] }),
      title: rotulo, alt: rotulo, riseOnHover: true
    }).bindPopup(`<strong>${esc(pc.nome)}</strong><br>${esc(pc.bairro)}, ${esc(cidadeDe(pc))}${local ? `<br>${textoDistancia(distanciaKm(local, pc))}` : ''}${pc.demonstracao ? '<br><em>Endereço de demonstração</em>' : ''}`);
    mk.addTo(m.camada);
    pc._marcador = mk;
    const el = mk.getElement();
    if (el) { el.setAttribute('aria-label', rotulo); el.dataset.parceiro = pc.id; }
  });
  marcadorVoce(m);
  if (!m.avisoDemo && lista.some(pc => pc.demonstracao)) {
    const Aviso = L.Control.extend({ onAdd: () => { const d = L.DomUtil.create('div', 'mapa-demo'); d.innerHTML = `${icone('i-info', 'ic ic-s')}Pontos de demonstração`; return d; } });
    m.avisoDemo = new Aviso({ position: 'topright' }).addTo(m);
  }
  enquadrar(m, lista.map(pc => [pc.latitude, pc.longitude]));
}

const ESTILO_LOGO = { azul: 'pl-1', preto: 'pl-2', patas: 'pl-3' };
function desenharParceiros() {
  const lista = ordenarPorDistancia(PARCEIROS);
  $('#parceiros-lista').innerHTML = lista.map((pc, i) => `<li class="parceiro${local && i === 0 ? ' parceiro-perto' : ''}">
    <span class="p-logo ${ESTILO_LOGO[pc.estiloLogo] || 'pl-1'}" aria-hidden="true">${pc.estiloLogo === 'patas' ? '<svg><use href="#i-pata"/></svg>' : ''}${pc.logo.map(esc).join('<br>')}</span>
    <div class="p-info"><strong>${esc(pc.nome)}</strong><span class="p-dist">${esc(textoLocal(pc))}</span><span>${pc.servicos.map(esc).join(' • ')}</span>
      <button type="button" class="link-btn p-ver" data-ver-parceiro="${esc(pc.id)}">Ver no mapa<span class="sr">: ${esc(pc.nome)}</span></button></div>
    <span class="nota" aria-label="Nota ${esc(pc.nota)} de 5">${esc(pc.nota)} ★</span>
    <div class="p-preco"><span class="off">${pc.desconto}% OFF</span><small>a partir de</small><b>R$ ${esc(pc.precoDesde)}</b></div>
  </li>`).join('');
  atualizarMapaParceiros(lista);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ver-parceiro]');
  if (!b) return;
  const pc = PARCEIROS.find(x => x.id === b.dataset.verParceiro);
  const m = mapaPronto('mapa-parceiros');
  if (!m || !pc || !pc._marcador) { aviso('O mapa não está disponível agora'); return; }
  $('#mapa-parceiros').scrollIntoView({ block: 'center' });
  m.setView([pc.latitude, pc.longitude], 15, { animate: false });
  pc._marcador.openPopup();
});

/* Lista | Mapa (celular) */
const colunaAnimais = $('#mapa-pets-w').parentElement;
$$('[data-modo]').forEach(b => b.addEventListener('click', () => {
  const mapa = b.dataset.modo === 'mapa';
  colunaAnimais.classList.toggle('modo-mapa', mapa);
  $$('[data-modo]').forEach(x => x.setAttribute('aria-pressed', x === b));
  if (mapa) atualizarMapaPets();
}));
let redimTimer;
window.addEventListener('resize', () => {
  clearTimeout(redimTimer);
  redimTimer = setTimeout(() => {
    if (paginaAtual === 'animais') atualizarMapaPets();
    if (paginaAtual === 'beneficios') desenharParceiros();
  }, 200);
});

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
          ${linhaDado('i-local', 'Localização', p.bairro ? `${p.bairro}, ${p.localizacao}${local ? ` · ${textoDistancia(distanciaKm(local, p))}` : ''}` : p.localizacao)}
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
  if (pag === 'animais') atualizarMapaPets();
  if (pag === 'beneficios') desenharParceiros();
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
  const [rp, rc] = await Promise.allSettled([ARQUIVO_PETS, ARQUIVO_PARCEIROS].map(async a => {
    const r = await fetch(a, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${a}: ${r.status}`);
    return r.json();
  }));
  if (rc.status === 'fulfilled') PARCEIROS = rc.value;
  else { console.warn('Não foi possível carregar os parceiros:', rc.reason); $('#parceiros-lista').innerHTML = '<li class="vazio">Não foi possível carregar as unidades parceiras agora.</li>'; }
  try {
    if (rp.status === 'rejected') throw rp.reason;
    PETS = rp.value;
  } catch (e) {
    console.warn('Não foi possível carregar os pets:', e);
    $('#grade').innerHTML = $('#carrossel').innerHTML = '<p class="vazio">Não foi possível carregar os pets agora. Tente recarregar a página.</p>';
  }
  for (const id of [...favoritos]) if (!PETS.some(p => p.id === id)) favoritos.delete(id);
  desenharCarrossel();
  if (PARCEIROS.length) desenharParceiros();
  sincronizarFiltros();
  desenharGrade();
  atualizarFavoritos();
  rotear();
  if (!location.hash) $$('[data-nav]')[0].setAttribute('aria-current', 'page');
}
iniciar();
