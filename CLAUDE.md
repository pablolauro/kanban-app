# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server em http://localhost:5173
npm run typecheck    # tsc -b --noEmit (único gate estático — não há linter)
npm run build        # tsc -b && vite build
npm run test:e2e     # testes de ponta a ponta; EXIGE o dev server rodando
```

`npm run test:e2e` roda [tests/drag.mjs](tests/drag.mjs): um script Playwright
sem framework de teste, que dirige o **Chrome instalado na máquina**
(`channel: 'chrome'`) — não há download de browser do Playwright. Variáveis:
`BASE_URL` (default `http://localhost:5173`) e `HEADED=1` para ver o navegador.

Não existe runner de teste unitário nem filtro por nome de caso. Para rodar um
caso isolado, comente os blocos vizinhos no script — cada caso é um bloco
`{ ... }` numerado e independente, exceto pelo estado do quadro que o anterior
deixou. O script grava `tests/board.png` ao final.

Interface e comentários de código estão em **português (pt-BR)**.

## Arquitetura

Três camadas, com uma regra que governa o resto: **componentes e store nunca
tocam em `localStorage`**. Toda escrita atravessa a interface `BoardRepository`.

```
src/domain/     Regras puras. Zero React, zero storage.
src/data/       Persistência atrás de um contrato
src/store/      Zustand — chama só a interface
src/components/ UI
sql/schema.sql  Schema alvo em Postgres/Neon
```

O projeto hoje salva em `localStorage`, mas foi desenhado para migrar para
Postgres/Neon trocando **uma linha** em [src/data/index.ts](src/data/index.ts)
(`LocalStorageBoardRepository` → `HttpBoardRepository`, que já está escrito e
compilando em [httpRepository.ts](src/data/httpRepository.ts)). Quatro decisões
sustentam isso — quebrá-las custa uma refatoração inteira depois:

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

`sql/schema.sql` espelha [domain/types.ts](src/domain/types.ts) 1:1 — ao
adicionar campo a `Card`/`Column`, atualize os dois.

### Invariantes que não são óbvias no código

- **`insertIndex` em [BoardView.tsx](src/components/BoardView.tsx) calcula
  contra a lista COMPLETA da coluna (`byColumn`), nunca a lista visível
  (`visibleByColumn`).** É isso que faz o arraste continuar correto com filtro
  ativo: soltar "abaixo daquele card" posiciona certo mesmo havendo cards
  ocultos no meio. Trocar para a lista visível causa colisão de `position`.

- **`moveCardLocal` (preview, não persiste) vs `commitCardMove` (persiste).**
  Durante o arraste o card passeia por várias colunas em preview; só o commit
  grava. Por isso o carimbo de `completedAt` mora no commit, não no preview.

- **Novos campos em `Card`/`Column` precisam de default em `safeRead()`**
  ([localStorageRepository.ts](src/data/localStorageRepository.ts)) — é a
  migração de quadros já salvos na máquina do usuário.

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
