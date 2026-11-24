# Como adicionar um pet

Edite `pets.json` e acrescente um objeto à lista (separe com vírgula). A foto vai em `img/pets/`.

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
| `personalidade` | lista de traços (o 1º aparece no card) | `Ativo`, `Calmo`, `Sociável`, `Tímido`, `Brincalhão`, `Dócil`, `Curioso` |
| `sobre` | descrição | texto |
| `foto` | caminho da imagem | ex. `"img/pets/rex.jpg"` (quadrada de preferência) |
| `alt` | descrição da foto para leitores de tela | texto |

O quiz e os filtros passam a considerar o novo pet automaticamente.
O número do WhatsApp fica no topo de `js/app.js` (`WHATSAPP_NUMERO`).
