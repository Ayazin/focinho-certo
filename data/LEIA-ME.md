# Como adicionar um pet

Edite `docs/data/pets.json` e acrescente um objeto à lista (separe com vírgula). A foto vai em `docs/img/pets/`.

| Campo | O que é | Valores aceitos |
|---|---|---|
| `id` | identificador único, usado no link (`#pet/id`) | minúsculas, sem espaço nem acento |
| `nome` | nome do pet | texto |
| `especie` | espécie | `cao`, `gato` ou `outro` |
| `raca` | raça | texto (usado também na busca) |
| `sexo` | sexo | `Macho` ou `Fêmea` |
| `idade` | idade em anos | número; use decimal para meses (`0.5` = 6 meses). Menos de 1 = Filhote, 8 ou mais = Idoso |
| `porte` | porte | `Pequeno`, `Médio` ou `Grande` |
| `peso` | peso | texto, ex. `"12 kg"` |
| `localizacao` | cidade | texto, ex. `"São Paulo - SP"` |
| `bairro` | bairro onde o pet está | texto, ex. `"Pinheiros"` |
| `latitude` / `longitude` | **centro do bairro** (nunca o endereço) | número com até 3 casas decimais, ex. `-23.567` e `-46.693` |
| `personalidade` | lista de traços (o 1º aparece no card) | `Ativo`, `Calmo`, `Sociável`, `Tímido`, `Brincalhão`, `Dócil`, `Curioso` |
| `sobre` | descrição | texto |
| `foto` | caminho da imagem, relativo a `docs/` | ex. `"img/pets/rex.jpg"` (arquivo em `docs/img/pets/rex.jpg`, quadrado de preferência) |
| `alt` | descrição da foto para leitores de tela | texto |

O quiz, os filtros e o mapa passam a considerar o novo pet automaticamente.

## ⚠ Localização dos pets: sempre aproximada

Muitos pets ficam em **casas de lares temporários**. Por isso, `latitude` e `longitude`
devem ser o **centro do bairro**, nunca o endereço de onde o pet está:

- Use **no máximo 3 casas decimais** (precisão de ~100 m). O teste `npm test` falha se houver mais.
- Para achar o centro do bairro: no [openstreetmap.org](https://www.openstreetmap.org), busque
  o nome do bairro e da cidade (ex.: "Pinheiros, São Paulo"), clique com o botão direito no meio
  da área do bairro → "Mostrar endereço"; as coordenadas aparecem na barra lateral. Arredonde para 3 casas.
- No site, o pet aparece como um círculo de ~700 m em volta desse ponto, com o aviso
  "Os círculos mostram o bairro de cada pet, não o endereço exato".
- Nunca coloque rua, número ou referência do lar temporário em nenhum campo (`sobre`, `bairro` etc.).

# Unidades parceiras (Banho & Tosa)

Ficam em `docs/data/parceiros.json`. Diferente dos pets, aqui a localização é o **endereço exato**
da loja, porque é um estabelecimento comercial que a pessoa vai visitar.

| Campo | O que é |
|---|---|
| `id` | identificador único (minúsculas, com hífen) |
| `nome` | nome da unidade |
| `logo` | linhas do texto do logo, ex. `["Pet", "Clean"]` |
| `estiloLogo` | `azul`, `preto` ou `patas` |
| `bairro` / `cidade` | ex. `"Vila Madalena"` e `"São Paulo - SP"` |
| `latitude` / `longitude` | endereço exato da loja |
| `servicos` | lista, ex. `["Banho", "Tosa", "Hidratação"]` |
| `nota` | ex. `"4,8"` |
| `desconto` | número, ex. `30` |
| `precoDesde` | ex. `"45,50"` |
| `demonstracao` | `true` enquanto o parceiro for fictício (mostra "Pontos de demonstração" no mapa e "Endereço de demonstração" no balão) |

⚠ **Hoje os 3 parceiros são fictícios** (`"demonstracao": true`), com pontos no centro do bairro.
Ao cadastrar parceiros reais, use o endereço real, troque `demonstracao` para `false` e remova os avisos
de "Projeto demonstrativo" do rodapé e do cupom em `docs/index.html` (se planos e cupom também forem reais).

# Mapa e buscas de endereço

- Mapa: Leaflet 1.9.4 (cdnjs, com hash SRI) + mapas do OpenStreetMap (sem chave de API).
- "Usar minha localização" usa o GPS do navegador; a posição fica só na memória da página.
- Endereço digitado: CEP → ViaCEP; texto → Nominatim (OpenStreetMap), só ao clicar em "Buscar",
  com no máximo 1 consulta por segundo e cache de buscas repetidas.
O número do WhatsApp fica no topo de `docs/js/app.js` (`WHATSAPP_NUMERO`).
