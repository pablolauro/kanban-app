# Kanban

Quadro Kanban com colunas e cards totalmente editáveis, drag & drop e
persistência em Postgres (Neon) por meio de uma API própria no mesmo
repositório.

## Stack

| Peça | Escolha | Por quê |
| --- | --- | --- |
| Linguagem | **TypeScript** (strict) | O domínio (card, coluna, posição) é o coração do app; tipos evitam erro de ordenação silencioso. |
| UI | **React 19** | Ecossistema de drag & drop maduro. |
| Build | **Vite 6** | Dev server instantâneo, build de ~100 kB gzip. |
| Estilo | **Tailwind CSS v4** | Design consistente sem CSS paralelo; tema claro/escuro por tokens. |
| Drag & drop | **@dnd-kit** | Funciona com mouse, toque **e teclado** (acessível), diferente do HTML5 DnD nativo. |
| Estado | **Zustand** | Store única, sem boilerplate; as ações já são `async` para o dia do backend. |
| API | **Hono** em `server/` | Roda igual em Node (dev) e como Vercel Function (`api/`). |
| Banco | **Neon** (Postgres) via `@neondatabase/serverless` | Driver HTTP, sem pool — próprio para serverless. |
| Validação | **zod** | Todo corpo que entra na API; schemas amarrados aos tipos do domínio. |

## Rodando

```bash
npm install
cp .env.example .env.local   # DATABASE_URL e API_TOKEN
npm run dev        # Vite em :5173 + API em :3000 (proxy /api)
npm run build      # typecheck (front + server) + bundle em dist/
npm run typecheck
```

Na primeira abertura o app pede a **chave de acesso** (o valor de
`API_TOKEN`) e a guarda no navegador. Não há login: é um quadro de usuário
único, e a chave é o que impede qualquer um com a URL de ler ou escrever.

### Deploy (Vercel)

O front sai de `dist/` e a API é a Function `api/index.ts` (o `vercel.json`
reescreve `/api/*` para ela). Configure no projeto da Vercel as variáveis
`DATABASE_URL` (branch `main` do Neon, connection string *pooled*) e
`API_TOKEN`.

### Migração do localStorage

Quando o servidor responde que não há quadro (`GET /api/boards/current` →
404), o app envia o quadro salvo no localStorage **desta origem** para
`POST /api/boards/import` — ou o quadro padrão, se não houver nada salvo. O
import só grava com o banco vazio (409 caso contrário, reforçado pelo índice
`boards_singleton`), então um segundo navegador nunca sobrescreve o primeiro.
O `kanban.board.v1` local não é apagado: fica como backup.

## O que dá para fazer

- **Colunas**: criar (botão "Adicionar coluna" no fim do quadro), renomear
  (duplo clique no nome ou menu `⋯`), trocar a cor, definir limite de WIP,
  excluir (com confirmação e contagem de cards), e **reordenar arrastando o
  cabeçalho**. As três colunas padrão (A Fazer, Em Andamento, Concluído) são
  só dados iniciais — nada no código depende delas.
- **Cards**: criar pelo composer no pé da coluna (Enter salva e mantém o
  campo aberto para o próximo), ou **vários de uma vez** pelo menu `⋯` →
  "Adicionar vários cards…" (separados por `;` ou por quebra de linha, com
  prévia numerada antes de confirmar); abrir para editar título, descrição,
  prioridade, prazo, **data de conclusão**, etiquetas e coluna; duplicar;
  excluir.
- **Data de conclusão**: preenchida sozinha com a data de hoje quando o card
  entra numa **coluna de conclusão** — mas só se o campo estiver vazio. Data
  informada antes é sempre preservada, e o campo nunca fica bloqueado
  (botões "Hoje" e "Limpar" no diálogo do card). Sair da coluna de conclusão
  não apaga a data: remover é decisão manual.
- **Coluna de conclusão** é uma flag (`isDone`), alternável no menu `⋯` e
  marcada com ✓ no cabeçalho — não é o título "Concluído". Assim renomear a
  coluna para "Done", "Finalizado" ou o que for não quebra o carimbo. Pode
  haver mais de uma, ou nenhuma.
- **Arrastar**: card dentro da coluna e entre colunas, com preview ao vivo.
  Com o teclado: Tab até o card, Espaço para pegar, setas para mover, Espaço
  para soltar.
- **Filtros** na barra de topo: chips de **prioridade** (multi-seleção —
  nenhum marcado = todas) combinados com a **busca** por título, descrição e
  etiquetas (`/` foca o campo). Os dois se somam. Uma barra mostra o filtro
  ativo e quantos cards estão ocultos, com "limpar filtro"; o contador de
  cada coluna vira "visíveis de total".
  O filtro é **estado de sessão**: não é salvo, para você não abrir o quadro
  amanhã achando que os cards sumiram.
  **Arrastar continua funcionando com filtro ativo** — o cálculo de posição
  usa a lista completa da coluna, então soltar um card "abaixo daquele ali"
  o coloca na posição certa mesmo havendo cards ocultos no meio.
- **Tema** claro/escuro persistido, **exportar/importar JSON** e
  **recomeçar quadro**.

## Arquitetura — a parte que importa para o futuro banco

```
src/
  domain/        Tipos e regras puras. Zero dependência de React ou storage.
    types.ts       Board, Column, Card — espelham as tabelas SQL
    ordering.ts    posições fracionárias (ver abaixo)
  data/
    repository.ts            <- CONTRATO: toda escrita passa por aqui
    httpRepository.ts         <- implementação em uso (API)
    migration.ts              <- semeia o servidor com o quadro local
    localStorageRepository.ts <- implementação anterior (ainda compila)
    index.ts                  <- ÚNICO ponto de troca
  store/boardStore.ts   Zustand. Chama só a interface, nunca o storage.
  components/           UI. Não sabe que existe rede nem storage.
server/
  app.ts                Rotas Hono — espelham o httpRepository 1:1
  schemas.ts            Validação zod (regras de entrada)
  db.ts                 Cliente Neon e SQL de leitura/inserção em lote
  auth.ts               Bearer API_TOKEN
  dev.ts                Servidor Node local (porta 3000)
api/index.ts            Adaptador Vercel Function
sql/schema.sql          Schema do Postgres/Neon
```

### Por que a troca para o banco foi barata

O front passou de localStorage para a API trocando a implementação em
`src/data/index.ts` — nenhum componente mudou. Isso funciona porque:

1. **Todos os métodos do repositório já são `Promise`**, mesmo com
   localStorage sendo síncrono. A UI já convive com latência, então a rede
   não muda nenhum componente.
2. **IDs são UUID gerados no cliente** (`domain/ids.ts`), não autoincremento.
   Criar um card não precisa de ida e volta ao servidor.
3. **Ordenação fracionária** (`domain/ordering.ts`): cada item guarda um
   `position: number` e mover um card é a média entre os vizinhos. No banco
   isso é **um** `UPDATE`, não a reescrita de todos os irmãos. Quando a
   precisão de float se esgota (`needsRebalance`), a lista é reespaçada —
   o equivalente a um batch update ocasional.
4. **Escritas são otimistas**: o estado muda na tela e a persistência vai
   atrás; falha aparece como aviso no topo (`guard()` no store).

No servidor, escritas com mais de um comando (mover vários cards, importar
o quadro) vão numa única transação do Neon, e `PATCH /cards/positions`
atualiza o lote inteiro num só `UPDATE ... FROM jsonb_array_elements`.

## Teste de drag & drop

```bash
npm run dev          # em um terminal
npm run test:e2e     # em outro — usa o Chrome instalado, sem baixar browser
```

**O teste apaga o quadro** (usa "Recomeçar quadro"). Por isso ele só roda se
o `.env.local` tiver `E2E_RESET_OK=1` — linha que só deve existir no env que
aponta para a branch `dev` do Neon, nunca para a `main`.

`tests/drag.mjs` dirige o navegador de verdade e checa **o banco, via API**,
depois de cada arraste (é o que prova que persistiu, não só que a tela mexeu):

1. card muda de coluna arrastando;
2. card reordena dentro da própria coluna;
3. coluna reordena pelo cabeçalho;
4. clicar no card ainda abre o editor;
5. arrastar **não** abre o editor;
6. data de conclusão é carimbada ao cair na coluna de conclusão;
7. data já informada é preservada (não sobrescrita) nessa mesma mudança;
8. sair da coluna de conclusão não apaga a data;
9. renomear a coluna de conclusão não quebra o carimbo;
10. criação em lote por `;` — prévia, limpeza de espaços, separadores vazios
    ignorados e ordem digitada preservada;
11. filtro de prioridade esconde sem apagar, e chips somam entre si;
12. arrastar com filtro ativo põe o card depois de um card **oculto** da
    coluna destino — a prova de que a conta usa a lista completa.

`HEADED=1 npm run test:e2e` roda com o navegador visível.
