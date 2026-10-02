# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite :5173 + API :3000 (concurrently); proxy /api → API_PORT
npm run dev:api      # só a API (tsx watch, lê .env.local)
npm run typecheck    # tsc -b --noEmit, cobre src/ e server/+api/ (tsconfig.server.json)
npm run build        # tsc -b && vite build
npm run test:e2e     # testes de ponta a ponta; EXIGE o dev server rodando
```

`.env.local` (ignorado pelo git; modelo em `.env.example`): `DATABASE_URL`,
`API_TOKEN` e, só no env da branch `dev`, `E2E_RESET_OK=1`. O `.env.local`
aponta para a branch `dev`; os valores de produção (branch `main`, os mesmos
da Vercel) ficam em `.env.production.local` — sem prefixo `VITE_`, então o
Vite nunca os expõe no bundle.

`npm run test:e2e` roda [tests/drag.mjs](tests/drag.mjs): um script Playwright
sem framework de teste, que dirige o **Chrome instalado na máquina**
(`channel: 'chrome'`) — não há download de browser do Playwright. Variáveis:
`BASE_URL` (default `http://localhost:5173`) e `HEADED=1` para ver o navegador.

Não existe runner de teste unitário nem filtro por nome de caso. Para rodar um
caso isolado, comente os blocos vizinhos no script — cada caso é um bloco
`{ ... }` numerado e independente, exceto pelo estado do quadro que o anterior
deixou. O script grava `tests/board.png` ao final.

**O e2e apaga o quadro** ("Recomeçar quadro") e lê o estado persistido via
`GET /api/boards/current`. Ele se recusa a rodar sem `E2E_RESET_OK=1` — nunca
ponha essa linha num env que aponte para a branch `main` do Neon (produção).
Para rodar isolado do dev server do usuário: API com outro env em
`API_PORT=3001` e `API_PORT=3001 npx vite --port 5174`, depois
`BASE_URL=http://localhost:5174 npm run test:e2e`.

Interface e comentários de código estão em **português (pt-BR)**.

## Arquitetura

Monólito modular: front (Vite/React) e API (Hono) no mesmo repo e no mesmo
deploy Vercel. Regra que governa o resto: **componentes e store nunca tocam em
`localStorage` nem em `fetch`**. Toda escrita atravessa a interface
`BoardRepository`; storage do navegador (chave de acesso, backup da migração)
só em `src/data/`.

```
src/domain/     Regras puras. Zero React, zero storage.
src/data/       Persistência atrás de um contrato (HttpBoardRepository em uso)
src/store/      Zustand — chama só a interface
src/components/ UI
server/         API Hono: app.ts (rotas), schemas.ts (zod), db.ts (Neon), auth.ts
api/index.ts    Adaptador Vercel Function; vercel.json reescreve /api/* para cá
sql/schema.sql  Schema do Postgres/Neon
```

Neon: projeto `kanban-app` (`twilight-smoke-28532124`, aws-sa-east-1). Branch
`main` = produção (Vercel); branch `dev` = desenvolvimento local e e2e.

Persistência em Postgres/Neon via [src/data/index.ts](src/data/index.ts)
(`HttpBoardRepository`). O `LocalStorageBoardRepository` continua compilando,
e `safeRead()` dele é reusado pela migração. Quatro decisões sustentam a
camada de dados — quebrá-las custa uma refatoração inteira:

1. **Todos os métodos do repositório são `Promise`**, mesmo com localStorage
   sendo síncrono. A UI já convive com latência.
2. **IDs são UUID gerados no cliente** ([domain/ids.ts](src/domain/ids.ts)),
   não autoincremento.
3. **Ordenação fracionária** ([domain/ordering.ts](src/domain/ordering.ts)):
   cada card/coluna guarda `position: number` e mover é a média entre os
   vizinhos — 1 `UPDATE`, não N. `needsRebalance`/`rebalance` reespaçam a
   lista quando a precisão de float se esgota.
4. **Escritas otimistas**: o estado muda na hora, a persistência vai atrás, e
   `guard()` no store captura a falha em `state.error` (a UI mostra um aviso).

`sql/schema.sql` espelha [domain/types.ts](src/domain/types.ts) 1:1, e
[server/schemas.ts](server/schemas.ts) valida o mesmo formato (`satisfies
z.ZodType<Card>` acusa divergência no typecheck). Ao adicionar campo a
`Card`/`Column`, atualize os **três**, mais os SELECT/INSERT de
[server/db.ts](server/db.ts) e a whitelist de `setClause` em
[server/app.ts](server/app.ts) — e aplique o `ALTER TABLE` nas duas branches.

### Invariantes que não são óbvias no código

- **`insertIndex` em [BoardView.tsx](src/components/BoardView.tsx) calcula
  contra a lista COMPLETA da coluna (`byColumn`), nunca a lista visível
  (`visibleByColumn`).** É isso que faz o arraste continuar correto com filtro
  ativo: soltar "abaixo daquele card" posiciona certo mesmo havendo cards
  ocultos no meio. Trocar para a lista visível causa colisão de `position`.

- **`moveCardLocal` (preview, não persiste) vs `commitCardMove` (persiste).**
  Durante o arraste o card passeia por várias colunas em preview; só o commit
  grava. Por isso o carimbo de `completedAt` mora no commit, não no preview.

- **Migração do localStorage**: `GET /boards/current` → 404 faz o
  `HttpBoardRepository.load()` enviar `seedSnapshot()`
  ([migration.ts](src/data/migration.ts)) para `POST /boards/import`, que só
  grava com o banco vazio (409 senão; índice `boards_singleton` fecha a
  corrida). `PUT /boards/current` é outra coisa: substitui tudo (importar
  JSON / recomeçar). O backup `kanban.board.v1` nunca é apagado.

- **Datas `date` saem do banco como `::text`** em [server/db.ts](server/db.ts).
  O parser do driver viraria `Date` à meia-noite UTC e deslocaria o dia.

- **`completedAt` em `PATCH /cards/positions`**: chave ausente = não mexe;
  `null` = limpa (`p ? 'completedAt'` no SQL). Não troque por default.

- **Retry só em leitura** (`retryRead` em db.ts): o Neon às vezes derruba o
  socket keep-alive (`fetch failed`). Repetir escrita pode duplicar efeito.

- **Coluna de conclusão é a flag `isDone`, nunca o título.** Colunas são
  renomeáveis; casar por `'Concluído'` quebra silenciosamente. `looksDone()`
  existe só para migrar quadros antigos, não para runtime.

- **Filtro é estado de sessão** ([domain/filters.ts](src/domain/filters.ts)):
  vive em `App.tsx`, não entra no snapshot nem no localStorage.

- **Colunas padrão (A Fazer / Em Andamento / Concluído) são apenas dados** em
  [defaultBoard.ts](src/data/defaultBoard.ts). Nenhuma lógica depende delas.

### Armadilhas de dnd-kit

- **Em [CardView.tsx](src/components/CardView.tsx), `listeners` do dnd-kit já
  contém `onPointerDown`** — é ele que ativa o arraste. O handler próprio do
  card (que distingue clique de arraste pela distância) precisa **encadear**,
  nunca espalhar depois e sobrescrever. Esse bug já aconteceu e deixou os
  cards sem arraste enquanto as colunas continuavam funcionando.
- **`DragOverlay` usa `CardPreview`, não `CardView`** — reusar o `CardView`
  registraria o mesmo id de sortable duas vezes no `DndContext`.
- Colunas e cards vivem no mesmo `DndContext`; o tipo vem de `data.type`
  (`'card' | 'column' | 'columnDrop'`), e `columnIdOf()` resolve o destino.

### Tailwind v4

Classes são escaneadas no fonte: **nada de `bg-${cor}-500` dinâmico**. As
paletas de acento e prioridade estão resolvidas estaticamente em
[domain/accents.ts](src/domain/accents.ts) — adicione variantes lá. O tema
escuro usa classe (`@custom-variant dark` em [index.css](src/index.css)), não
só `prefers-color-scheme`, e um script em `index.html` aplica antes do primeiro
paint.

## Ambiente

O heredoc do Bash neste ambiente **colapsa barras invertidas** (`\\n` vira
quebra de linha real, `\\u0300` vira o caractere). Já corrompeu regex e strings
JS duas vezes. Para conteúdo com escapes, use as ferramentas de escrita/edição
de arquivo em vez de `cat <<'EOF'`.
