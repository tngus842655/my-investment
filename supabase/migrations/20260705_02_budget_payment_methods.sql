-- 가계부 결제수단을 카테고리와 동일한 방식(FK 참조)으로 전환
-- budget_entries/budget_favorites의 payment_method(text)를 payment_method_id(FK)로 교체

CREATE TABLE IF NOT EXISTS budget_payment_methods (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  sort_order  int8 NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE budget_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_payment_methods: 본인 select" ON budget_payment_methods
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "budget_payment_methods: 본인 insert" ON budget_payment_methods
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "budget_payment_methods: 본인 update" ON budget_payment_methods
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "budget_payment_methods: 본인 delete" ON budget_payment_methods
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS budget_payment_methods_user_id_idx ON budget_payment_methods (user_id, sort_order);


-- budget_entries: payment_method(text) → payment_method_id(FK, nullable)
ALTER TABLE budget_entries DROP COLUMN IF EXISTS payment_method;
ALTER TABLE budget_entries ADD COLUMN payment_method_id uuid REFERENCES budget_payment_methods(id) ON DELETE SET NULL;

-- budget_favorites: 동일하게 전환
ALTER TABLE budget_favorites DROP COLUMN IF EXISTS payment_method;
ALTER TABLE budget_favorites ADD COLUMN payment_method_id uuid REFERENCES budget_payment_methods(id) ON DELETE SET NULL;
