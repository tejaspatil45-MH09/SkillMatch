-- Up Migration

-- Display order must not depend on timestamps (rows inserted in one transaction share now()) or random uuids.
ALTER TABLE portfolio_items ADD COLUMN sort_order bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE experiences     ADD COLUMN sort_order bigint GENERATED ALWAYS AS IDENTITY;

-- Down Migration

ALTER TABLE experiences     DROP COLUMN sort_order;
ALTER TABLE portfolio_items DROP COLUMN sort_order;
