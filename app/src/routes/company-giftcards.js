import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { ACCOUNT_TYPES } from '../constants.js'
import { accounts, giftCards, ledger, ledgerEntries } from '../db/schema.js'
import { ROLES } from '../helpers/company.helper.js'
import { generateGiftCardCode } from '../helpers/gift-cards.helpers.js'
import { authenticate } from '../middleware/authenticate.js'
import { authorize } from '../middleware/authorize.js'
import { loadCompany } from '../middleware/company.js'

export default async function companyGiftCardsRoutes(fastify) {
  fastify.get(
    '/companies/:id/giftcards',
    { preHandler: [authenticate, loadCompany, authorize()] },
    async (request, reply) => {
      const giftcards = await fastify.db
        .select({
          code: giftCards.code,
          name: giftCards.name,
          description: giftCards.description,
          createdAt: giftCards.createdAt
        })
        .from(giftCards)
        .where(and(eq(giftCards.companyId, request.company.id), isNull(giftCards.deletedAt)))
        .orderBy(desc(giftCards.id))

      return giftcards
    }
  )

  fastify.post(
    '/companies/:id/gift-cards',
    { preHandler: [authenticate, loadCompany, authorize([ROLES.OWNER, ROLES.ADMIN])] },
    async (request, reply) => {
      const { quantity, amount, name, description } = request.body

      if (!quantity || !amount) {
        reply.code(400)
        return { error: 'quantity and amount are required' }
      }

      if (quantity < 1) {
        reply.code(400)
        return { error: 'Quantity must be at least 1' }
      }

      if (amount <= 0) {
        reply.code(400)
        return { error: 'Amount must be greater than 0' }
      }

      const result = await fastify.db.transaction(async (tx) => {
        const now = new Date()

        const [companyAccount] = await tx
          .select({ id: accounts.id })
          .from(accounts)
          .where(
            and(
              eq(accounts.companyId, request.company.id),
              eq(accounts.type, ACCOUNT_TYPES.COMPANY),
              isNull(accounts.deletedAt)
            )
          )

        if (!companyAccount) {
          reply.code(404)
          return { error: 'Company account not found' }
        }

        const giftCardsData = Array.from({ length: quantity }, () => {
          const code = generateGiftCardCode()
          return {
            companyId: request.company.id,
            code,
            name: name || `Gift Card ${code.substring(0, 8)}`,
            description: description || null,
            createdAt: now
          }
        })

        const insertedCards = await tx
          .insert(giftCards)
          .values(giftCardsData)
          .returning({ id: giftCards.id, code: giftCards.code })

        const giftCardAccountsData = insertedCards.map((c) => ({
          type: ACCOUNT_TYPES.GIFT_CARD,
          companyId: request.company.id,
          giftCardId: c.id,
          createdAt: now
        }))

        const insertedAccounts = await tx
          .insert(accounts)
          .values(giftCardAccountsData)
          .returning({ id: accounts.id, giftCardId: accounts.giftCardId })

        const ledgerData = insertedCards.map((c) => ({
          companyId: request.company.id,
          description: `Gift card ${c.code} created with amount ${amount}`,
          time: now
        }))

        const insertedLedger = await tx
          .insert(ledger)
          .values(ledgerData)
          .returning({ id: ledger.id, time: ledger.time })

        const ledgerEntriesData = insertedLedger.flatMap((l, idx) => [
          {
            ledgerId: l.id,
            ledgerTime: l.time,
            accountId: companyAccount.id,
            amount: -amount
          },
          {
            ledgerId: l.id,
            ledgerTime: l.time,
            accountId: insertedAccounts[idx].id,
            amount: amount
          }
        ])

        await tx.insert(ledgerEntries).values(ledgerEntriesData)

        reply.code(201)
        return {
          cards: {
            quantity,
            amount
          },
          total_value: quantity * amount
        }
      })

      return result
    }
  )
}
