-- CASCADE 삭제 시 portfolio가 이미 삭제된 경우 트리거 스킵
CREATE OR REPLACE FUNCTION sync_portfolio_from_transactions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_portfolio_id   uuid;
  v_total_buy_qty  numeric;
  v_total_buy_cost numeric;
  v_total_sell_qty numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_portfolio_id := OLD.portfolio_id;
  ELSE
    v_portfolio_id := NEW.portfolio_id;
  END IF;

  -- portfolio가 이미 삭제된 경우 스킵
  IF NOT EXISTS (SELECT 1 FROM portfolios WHERE id = v_portfolio_id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN transaction_type IN ('BUY','INITIAL') THEN quantity              ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type IN ('BUY','INITIAL') THEN quantity * unit_price  ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type = 'SELL'             THEN quantity              ELSE 0 END), 0)
  INTO v_total_buy_qty, v_total_buy_cost, v_total_sell_qty
  FROM transactions
  WHERE portfolio_id = v_portfolio_id;

  UPDATE portfolios
  SET quantity   = v_total_buy_qty - v_total_sell_qty,
      avg_price  = CASE WHEN v_total_buy_qty > 0 THEN v_total_buy_cost / v_total_buy_qty ELSE 0 END,
      updated_at = now()
  WHERE id = v_portfolio_id;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
