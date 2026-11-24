# Focinho Certo – site de adoção de pets

## Identidade visual (extraída do app)
- Cores: verde #0f5f4c, creme #fbf3e2, azul-marinho #14205a, rosa #f4b4ae, dourado #c8ad3a
- Fontes: Fredoka (títulos e botões), Roboto (texto)
- Fotos dos pets em círculo com borda rosa, botões arredondados (pill), patinhas decorativas

## Estrutura
- `docs/` é o site publicado (index.html, css/, js/, img/, data/pets.json). Só o que está aqui vai para o ar.
- Fora de `docs/`: referencias/, tests/ (servidor, validação, geração de imagens), data/LEIA-ME.md.
- Rodar: `npm start` (serve docs/ em http://localhost:5173). Validar: `npm test`.

## Regras
- É um SITE responsivo, não um app: navegação no topo no desktop, menu hambúrguer no celular.
  Nada de barra de navegação inferior estilo app.
- Textos em português do Brasil.
- Acessibilidade: contraste AA, alt nas imagens, navegação por teclado.
- Localização de pets: SEMPRE centro do bairro (máx. 3 casas decimais), nunca endereço de lar temporário.
  Parceiros usam endereço exato; enquanto forem fictícios, `"demonstracao": true` e avisos de projeto demonstrativo.
- Nominatim: só sob ação da pessoa (botão Buscar), no máximo 1 requisição/s, com cache. Nunca autocompletar.
- Testes não usam a internet para mapas/geocodificação (tudo simulado). `FC_MAPA_REAL=1 npm test` usa mapas reais só nos screenshots.

## Como validar (obrigatório antes de dizer que terminou)
1. Rodar o site localmente.
2. Tirar screenshots com Playwright em 375px (celular) e 1280px (desktop).
3. Comparar com as telas em referencias/telas-app/ e corrigir diferenças.
4. Testar os fluxos: filtrar animais, abrir detalhes, fazer o quiz até o resultado, copiar cupom.
5. Verificar o console do navegador: zero erros.
