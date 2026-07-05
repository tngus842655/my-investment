-- budget_categories: icon 컬럼을 없애고 카테고리 이름 하나로만 관리
-- 기존 icon 값은 name 앞에 합쳐서 화면에 보이던 모습을 그대로 유지

UPDATE budget_categories
SET name = icon || ' ' || name
WHERE icon IS NOT NULL AND icon <> '';

ALTER TABLE budget_categories DROP COLUMN icon;
