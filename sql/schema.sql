-- Schema alvo para Postgres/Neon.
-- O modelo em src/domain/types.ts mapeia 1:1 nestas tabelas; quando migrarmos,
-- a troca no front é só a linha de src/data/index.ts.

create table if not exists boards (
  id          uuid primary key,
  title       text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists columns (
  id          uuid primary key,
  board_id    uuid        not null references boards(id) on delete cascade,
  title       text        not null,
  accent      text        not null default 'slate',
  wip_limit   int         not null default 0,
  -- Coluna de conclusão: cards que chegam aqui ganham completed_at.
  -- É flag, e não o título, para sobreviver a renomear a coluna.
  is_done     boolean     not null default false,
  -- Ordenação fracionária: mover uma coluna é 1 UPDATE, não N.
  position    double precision not null,
  created_at  timestamptz not null default now()
);
create index if not exists columns_board_position_idx
  on columns (board_id, position);

create table if not exists cards (
  id          uuid primary key,
  column_id   uuid        not null references columns(id) on delete cascade,
  title       text        not null,
  description text        not null default '',
  priority    text        not null default 'medium'
                check (priority in ('low','medium','high','urgent')),
  due_date    date,
  completed_at date,
  tags        text[]      not null default '{}',
  position    double precision not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists cards_column_position_idx
  on cards (column_id, position);

-- Mover um card entre colunas, na posição escolhida. O carimbo de conclusão
-- vai no MESMO update: mover e concluir são um ato só.
--   update cards
--      set column_id = $1, position = $2, completed_at = $3, updated_at = now()
--    where id = $4;
