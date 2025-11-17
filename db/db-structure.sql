CREATE TABLE users (
  id serial primary key,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  profile jsonb,
  created_at TIMESTAMP DEFAULT current_timestamp,
  deleted_at TIMESTAMP
);

CREATE TABLE companies (
  id serial primary key,
  NAME VARCHAR(100) NOT NULL,
  metadata jsonb,
  created_at TIMESTAMP DEFAULT current_timestamp,
  deleted_at TIMESTAMP
);

CREATE TYPE user_company_role AS ENUM ('admin', 'owner', 'user');

CREATE TABLE user_companies (
  user_id INTEGER references users(id),
  company_id INTEGER references companies(id),
  role user_company_role NOT NULL,
  primary key (user_id, company_id)
);

CREATE TABLE gift_cards (
  id bigserial primary key,
  code VARCHAR(100) NOT NULL UNIQUE,
  company_id INTEGER references companies(id) ON
  DELETE
    RESTRICT,
    NAME VARCHAR(100) NOT NULL,
    description text,
    created_at TIMESTAMP DEFAULT current_timestamp,
    deleted_at TIMESTAMP
);

CREATE TYPE account_type AS enum (
  'company',
  'gift_card',
  'generic_in',
  'generic_out'
);

CREATE TABLE accounts (
  id bigserial primary key,
  TYPE account_type NOT NULL,
  company_id INTEGER references companies(id) ON
  DELETE
    RESTRICT NOT NULL,
    gift_card_id bigint references gift_cards(id) ON
  DELETE
    RESTRICT,
    created_at TIMESTAMP DEFAULT current_timestamp,
    deleted_at TIMESTAMP
);

CREATE TABLE ledger(
  id bigserial,
  company_id INTEGER references companies(id) ON
  DELETE
    RESTRICT NOT NULL,
    description text,
    time timestamptz NOT NULL
) WITH (
  timescaledb.hypertable,
  timescaledb.segmentby = 'company_id',
  timescaledb.orderby = 'time',
  timescaledb.chunk_interval = '1 day'
);

ALTER TABLE
  ledger
ADD
  PRIMARY KEY (id, time);

CREATE INDEX ON ledger (company_id, time DESC);

CREATE TABLE ledger_entries (
  id bigserial primary key,
  ledger_id bigint NOT NULL,
  ledger_time timestamptz NOT NULL,
  account_id bigint references accounts(id) ON
  DELETE
    RESTRICT NOT NULL,
    amount NUMERIC(18, 2) NOT NULL,
    FOREIGN KEY (ledger_id, ledger_time) REFERENCES ledger(id, time) ON
  DELETE
    RESTRICT
);

CREATE INDEX ON ledger_entries (ledger_id);

CREATE INDEX ON ledger_entries (account_id);

CREATE
OR replace FUNCTION prevent_ledger_delete() returns TRIGGER AS $$ BEGIN
  RAISE
  EXCEPTION
    'Deletion of ledger records is not permitted';

END;

$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_ledger_delete before
DELETE
  ON ledger FOR each ROW EXECUTE PROCEDURE prevent_ledger_delete();

CREATE
OR replace FUNCTION prevent_ledger_entries_delete() returns TRIGGER AS $$ BEGIN
  RAISE
  EXCEPTION
    'Deletion of ledger_entries records is not permitted';

END;

$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_ledger_entries_delete before
DELETE
  ON ledger_entries FOR each ROW EXECUTE PROCEDURE prevent_ledger_entries_delete();

CREATE
OR replace FUNCTION enforce_ledger_balance() returns TRIGGER AS $$
DECLARE
  total_balance numeric(18, 2);

BEGIN
  SELECT
    SUM(amount) INTO total_balance
  FROM
    ledger_entries
  WHERE
    ledger_id = NEW .ledger_id;

IF total_balance <> 0 THEN RAISE
EXCEPTION
  'Ledger % is unbalanced with total amount %',
  NEW .ledger_id,
  total_balance;

END IF;

RETURN NEW;

END;

$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_ledger_balance after
INSERT
  ON ledger_entries FOR each ROW EXECUTE PROCEDURE enforce_ledger_balance();

-- Adding indexes for an otimization
CREATE INDEX accounts_gift_card_active_idx ON accounts (gift_card_id)
WHERE
  deleted_at IS NULL
  AND type = 'gift_card';

-- Adding new column to accounts table
ALTER TABLE
  accounts
ADD
  COLUMN allowed_credit NUMERIC(18, 2) DEFAULT 0 NOT NULL;