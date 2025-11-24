import { and, eq, isNull, ne, sql, desc } from 'drizzle-orm'
import { ACCOUNT_TYPES } from '../constants.js'
import {
  accounts,
  companies,
  ledgerEntries,
  userCompanies
} from '../db/schema.js'
import { getAccountBalance } from '../helpers/accounts.helper.js'
import { ROLES } from '../helpers/company.helper.js'
import { authenticate } from '../middleware/authenticate.js'
import { authorize } from '../middleware/authorize.js'
import { loadCompany } from '../middleware/company.js'

export default async function companiesRoutes(fastify) {
  // GET all companies
  fastify.get(
    '/companies',
    { preHandler: authenticate },
    async (request, reply) => {
      return await fastify.db
        .select({
          id: companies.id,
          name: companies.name,
          metadata: companies.metadata,
          createdAt: companies.createdAt
        })
        .from(companies)
        .innerJoin(userCompanies, eq(companies.id, userCompanies.companyId))
        .where(
          and(
            isNull(companies.deletedAt),
            eq(userCompanies.userId, request.user.id)
          )
        )
        .orderBy(desc(companies.id))
    }
  )

  // GET single company by id
  fastify.get(
    '/companies/:id',
    { preHandler: [authenticate, loadCompany, authorize()] },
    async (request, reply) => {
      return request.company
    }
  )

  fastify.post(
    '/companies',
    { preHandler: authenticate },
    async (request, reply) => {
      const { name, metadata } = request.body

      if (!name) {
        reply.code(400)
        return { error: 'Name is required' }
      }

      const result = await fastify.db.transaction(async (tx) => {
        // Insert company
        const [company] = await tx
          .insert(companies)
          .values({
            name,
            metadata: metadata ?? null
          })
          .returning({
            id: companies.id,
            name: companies.name,
            metadata: companies.metadata,
            createdAt: companies.createdAt
          })

        // Insert related accounts
        const baseValues = { companyId: company.id, createdAt: sql`NOW()` }

        await tx.insert(accounts).values({
          type: ACCOUNT_TYPES.COMPANY,
          ...baseValues
        })

        await tx.insert(accounts).values({
          type: ACCOUNT_TYPES.GENERIC_IN,
          ...baseValues
        })

        await tx.insert(accounts).values({
          type: ACCOUNT_TYPES.GENERIC_OUT,
          ...baseValues
        })

        // Insert user-company connection with owner role
        await tx.insert(userCompanies).values({
          userId: request.user.id,
          companyId: company.id,
          role: 'owner'
        })

        return company
      })

      reply.code(201)
      return result
    }
  )

  fastify.patch(
    '/companies/:id',
    {
      preHandler: [
        authenticate,
        loadCompany,
        authorize([ROLES.OWNER, ROLES.ADMIN])
      ]
    },
    async (request, reply) => {
      const { name, metadata } = request.body

      if (!name && metadata === undefined) {
        reply.code(400)
        return { error: 'At least one field (name or metadata) is required' }
      }

      const updateValues = {}

      if (name) updateValues.name = name
      if (metadata !== undefined) updateValues.metadata = metadata

      const [company] = await fastify.db
        .update(companies)
        .set(updateValues)
        .where(
          and(eq(companies.id, request.company.id), isNull(companies.deletedAt))
        )
        .returning()

      if (!company) {
        reply.code(404)
        return { error: 'Company not found' }
      }

      return company
    }
  )

  fastify.delete(
    '/companies/:id',
    { preHandler: [authenticate, loadCompany, authorize([ROLES.OWNER])] },
    async (request, reply) => {
      const result = await fastify.db.transaction(async (tx) => {
        // Soft delete the company
        const [company] = await tx
          .update(companies)
          .set({ deletedAt: sql`NOW()` })
          .where(
            and(
              eq(companies.id, request.company.id),
              isNull(companies.deletedAt)
            )
          )
          .returning({ id: companies.id })

        if (!company) {
          return null // Caller will handle 404
        }

        // Soft delete related accounts
        await tx
          .update(accounts)
          .set({ deletedAt: sql`NOW()` })
          .where(eq(accounts.companyId, request.company.id))

        return company
      })

      if (!result) {
        reply.code(404)
        return { error: 'Company not found' }
      }

      reply.code(204)
      return
    }
  )
  fastify.get(
    '/companies/:id/balance',
    { preHandler: [authenticate, loadCompany, authorize()] },
    async (request, reply) => {
      // Drizzle query to get company + main account ID
      const [row] = await fastify.db
        .select({
          companyId: companies.id,
          companyName: companies.name,
          accountId: accounts.id
        })
        .from(companies)
        .leftJoin(
          accounts,
          and(
            eq(accounts.companyId, companies.id),
            eq(accounts.type, ACCOUNT_TYPES.COMPANY),
            isNull(accounts.deletedAt)
          )
        )
        .where(
          and(eq(companies.id, request.company.id), isNull(companies.deletedAt))
        )

      if (!row || !row.accountId) {
        reply.code(404)
        return { error: 'Company or company account not found' }
      }

      // TODO: switch to use drizzle for balance calculation
      const client = await fastify.pg.connect()
      try {
        const balance = await getAccountBalance(client, row.accountId)
        return {
          company_id: row.companyId,
          company_name: row.companyName,
          balance
        }
      } finally {
        client.release()
      }
    }
  )

  fastify.get(
    '/companies/:id/transactions',
    {
      preHandler: [
        authenticate,
        loadCompany,
        authorize([ROLES.OWNER, ROLES.ADMIN])
      ]
    },
    async (request, reply) => {
      const { account_type } = request.query

      const accountRows = await fastify.db
        .select({ id: accounts.id, type: accounts.type })
        .from(accounts)
        .where(
          and(
            eq(accounts.companyId, request.company.id),
            ne(accounts.type, ACCOUNT_TYPES.GIFT_CARD),
            isNull(accounts.deletedAt),
            account_type && Object.values(ACCOUNT_TYPES).includes(account_type)
              ? eq(accounts.type, account_type)
              : undefined
          )
        )

      if (accountRows.length === 0) {
        reply.code(404)
        return { error: 'No accounts found' }
      }

      const client = await fastify.pg.connect()
      try {
        const accountIds = accountRows.map((a) => a.id)

        const { rows: transactions } = await client.query(
          `SELECT
          l.id as ledger_id,
          l.time as timestamp,
          l.description,
          le.account_id,
          a.type as account_type,
          le.amount,
          SUM(le.amount) OVER (PARTITION BY le.account_id ORDER BY l.time, l.id) as running_balance
       FROM ledger_entries le
       JOIN ledger l ON l.id = le.ledger_id AND l.time = le.ledger_time
       JOIN accounts a ON a.id = le.account_id
       WHERE le.account_id = ANY($1)
       ORDER BY l.time DESC, l.id DESC`,
          [accountIds]
        )

        return {
          company_id: Number(request.company.id),
          company_name: request.company.name,
          accounts: accountRows.map((a) => ({
            account_id: Number(a.id),
            account_type: a.type
          })),
          transactions: transactions.map((t) => ({
            timestamp: t.timestamp,
            description: t.description,
            account_type: t.account_type,
            amount: parseFloat(t.amount),
            balance_after: parseFloat(t.running_balance)
          }))
        }
      } finally {
        client.release()
      }
    }
  )
  fastify.get(
    '/companies/:id/account-totals',
    {
      preHandler: [
        authenticate,
        loadCompany,
        authorize([ROLES.OWNER, ROLES.ADMIN])
      ]
    },
    async (request, reply) => {
      const balances = await fastify.db
        .select({
          type: accounts.type,
          balance: sql`COALESCE(SUM(${ledgerEntries.amount}), 0)`
        })
        .from(accounts)
        .leftJoin(ledgerEntries, eq(ledgerEntries.accountId, accounts.id))
        .where(
          and(
            eq(accounts.companyId, request.company.id),
            isNull(accounts.deletedAt)
          )
        )
        .groupBy(accounts.type)

      const accountTotals = {}
      balances.forEach((row) => {
        accountTotals[row.type] = parseFloat(row.balance)
      })

      // Ensure all account types are present (0 if missing)
      Object.values(ACCOUNT_TYPES).forEach((type) => {
        if (!(type in accountTotals)) {
          accountTotals[type] = 0
        }
      })

      return {
        company_id: Number(request.company.id),
        company_name: request.company.name,
        account_totals: accountTotals
      }
    }
  )
}
