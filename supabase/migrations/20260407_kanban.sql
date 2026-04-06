-- Shared Kanban board (one board per workspace, multiple columns and cards)

CREATE TABLE IF NOT EXISTS public.kanban_columns (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid       NOT NULL,
  name        text        NOT NULL,
  position    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kanban_cards (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL,
  column_id    uuid        NOT NULL REFERENCES public.kanban_columns(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  description  text,
  assigned_to  text,
  position     integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS (enable and allow workspace members full access)
ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_cards   ENABLE ROW LEVEL SECURITY;

-- Service-role bypass (API uses admin client)
CREATE POLICY "service role bypass columns"
  ON public.kanban_columns FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "service role bypass cards"
  ON public.kanban_cards FOR ALL
  USING (true) WITH CHECK (true);
