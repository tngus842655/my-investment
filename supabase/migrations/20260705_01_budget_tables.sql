-- 가계부(budget) 모듈 테이블 생성: budget_categories, budget_entries, budget_favorites
-- KRW 전용(자산관리와 달리 통화 구분 없음), type은 enum 대신 text+CHECK로 단순화

CREATE TABLE IF NOT EXISTS budget_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
  name        text NOT NULL,
  icon        text NOT NULL,
  sort_order  int8 NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE budget_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_categories: 본인 select" ON budget_categories
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "budget_categories: 본인 insert" ON budget_categories
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "budget_categories: 본인 update" ON budget_categories
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "budget_categories: 본인 delete" ON budget_categories
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS budget_categories_user_id_idx ON budget_categories (user_id, type, sort_order);


CREATE TABLE IF NOT EXISTS budget_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id     uuid NOT NULL REFERENCES budget_categories(id) ON DELETE RESTRICT,
  type            text NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
  amount          numeric NOT NULL,
  payment_method  text,
  memo            text,
  entry_date      date NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE budget_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_entries: 본인 select" ON budget_entries
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "budget_entries: 본인 insert" ON budget_entries
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "budget_entries: 본인 update" ON budget_entries
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "budget_entries: 본인 delete" ON budget_entries
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS budget_entries_user_date_idx ON budget_entries (user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS budget_entries_category_idx ON budget_entries (category_id);


CREATE TABLE IF NOT EXISTS budget_favorites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id     uuid NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
  amount          numeric NOT NULL,
  payment_method  text,
  memo            text,
  sort_order      int8 NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE budget_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_favorites: 본인 select" ON budget_favorites
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "budget_favorites: 본인 insert" ON budget_favorites
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "budget_favorites: 본인 update" ON budget_favorites
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "budget_favorites: 본인 delete" ON budget_favorites
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS budget_favorites_user_id_idx ON budget_favorites (user_id, sort_order);
