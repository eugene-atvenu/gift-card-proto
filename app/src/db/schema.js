import {
  pgTable,
  index,
  foreignKey,
  bigserial,
  integer,
  bigint,
  timestamp,
  numeric,
  serial,
  varchar,
  jsonb,
  unique,
  text,
  primaryKey,
  pgEnum,
  uuid
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const accountType = pgEnum('account_type', [
  'company',
  'gift_card',
  'generic_in',
  'generic_out'
])
export const userCompanyRole = pgEnum('user_company_role', [
  'admin',
  'owner',
  'user'
])

export const accounts = pgTable(
  'accounts',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    type: accountType().notNull(),
    companyId: integer('company_id').notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    giftCardId: bigint('gift_card_id', { mode: 'number' }),
    createdAt: timestamp('created_at', { mode: 'string' }).default(
      sql`CURRENT_TIMESTAMP`
    ),
    deletedAt: timestamp('deleted_at', { mode: 'string' }),
    allowedCredit: numeric('allowed_credit', { precision: 18, scale: 2 })
      .default('0')
      .notNull()
  },
  (table) => [
    index('accounts_gift_card_active_idx')
      .using('btree', table.giftCardId.asc().nullsLast().op('int8_ops'))
      .where(
        sql`((deleted_at IS NULL) AND (type = 'gift_card'::account_type))`
      ),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'accounts_company_id_fkey'
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.giftCardId],
      foreignColumns: [giftCards.id],
      name: 'accounts_gift_card_id_fkey'
    }).onDelete('restrict')
  ]
)

export const companies = pgTable('companies', {
  id: serial().primaryKey().notNull(),
  name: varchar({ length: 100 }).notNull(),
  metadata: jsonb(),
  createdAt: timestamp('created_at', { mode: 'string' }).default(
    sql`CURRENT_TIMESTAMP`
  ),
  deletedAt: timestamp('deleted_at', { mode: 'string' })
})

export const users = pgTable(
  'users',
  {
    id: serial().primaryKey().notNull(),
    username: varchar({ length: 50 }).notNull(),
    email: varchar({ length: 100 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).default(
      sql`CURRENT_TIMESTAMP`
    ),
    deletedAt: timestamp('deleted_at', { mode: 'string' }),
    profile: jsonb()
  },
  (table) => [
    unique('users_username_key').on(table.username),
    unique('users_email_key').on(table.email)
  ]
)

export const giftCards = pgTable(
  'gift_cards',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    code: varchar({ length: 100 }).notNull(),
    companyId: integer('company_id'),
    name: varchar({ length: 100 }).notNull(),
    description: text(),
    createdAt: timestamp('created_at', { mode: 'string' }).default(
      sql`CURRENT_TIMESTAMP`
    ),
    deletedAt: timestamp('deleted_at', { mode: 'string' })
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'gift_cards_company_id_fkey'
    }).onDelete('restrict'),
    unique('gift_cards_code_key').on(table.code)
  ]
)

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    ledgerId: bigint('ledger_id', { mode: 'number' }).notNull(),
    ledgerTime: timestamp('ledger_time', {
      withTimezone: true,
      mode: 'string'
    }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    accountId: bigint('account_id', { mode: 'number' }).notNull(),
    amount: numeric({ precision: 18, scale: 2 }).notNull()
  },
  (table) => [
    index('ledger_entries_account_id_idx').using(
      'btree',
      table.accountId.asc().nullsLast().op('int8_ops')
    ),
    index('ledger_entries_ledger_id_idx').using(
      'btree',
      table.ledgerId.asc().nullsLast().op('int8_ops')
    ),
    foreignKey({
      columns: [table.accountId],
      foreignColumns: [accounts.id],
      name: 'ledger_entries_account_id_fkey'
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.ledgerId, table.ledgerTime],
      foreignColumns: [hyper54Chunk.id, hyper54Chunk.time],
      name: 'ledger_entries_id_time_fkey'
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.ledgerId, table.ledgerTime],
      foreignColumns: [hyper55Chunk.id, hyper55Chunk.time],
      name: 'ledger_entries_id_time_fkey1'
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.ledgerId, table.ledgerTime],
      foreignColumns: [ledger.id, ledger.time],
      name: 'ledger_entries_ledger_id_ledger_time_fkey'
    }).onDelete('restrict')
  ]
)

export const userCompanies = pgTable(
  'user_companies',
  {
    userId: integer('user_id').notNull(),
    companyId: integer('company_id').notNull(),
    role: userCompanyRole().notNull()
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'user_companies_company_id_fkey'
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'user_companies_user_id_fkey'
    }),
    primaryKey({
      columns: [table.userId, table.companyId],
      name: 'user_companies_pkey'
    })
  ]
)

export const ledger = pgTable(
  'ledger',
  {
    id: bigserial({ mode: 'bigint' }).notNull(),
    companyId: integer('company_id').notNull(),
    description: text(),
    time: timestamp({ withTimezone: true, mode: 'string' }).notNull()
  },
  (table) => [
    index('ledger_company_id_time_idx').using(
      'btree',
      table.companyId.asc().nullsLast().op('timestamptz_ops'),
      table.time.desc().nullsFirst().op('int4_ops')
    ),
    index('ledger_time_idx').using(
      'btree',
      table.time.desc().nullsFirst().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'ledger_company_id_fkey'
    }).onDelete('restrict'),
    primaryKey({ columns: [table.id, table.time], name: 'ledger_pkey' })
  ]
)

export const apiKeys = pgTable('api_keys', {
  key: uuid('key_id')
    .primaryKey()
    .default(sql`generate_uuidv7()`),
  secretHash: text('secret_hash').notNull(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  label: text('label'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true })
})
