import { and, eq, isNull } from 'drizzle-orm'
import { ACCOUNT_TYPES } from '../constants.js'
import { accounts, giftCards } from '../db/schema.js'

export async function loadGiftCard(request, reply) {
  const { code } = request.params

  if (!code) {
    reply.code(400)
    throw new Error('Gift card code is required')
  }

  // Use Drizzle to find gift card and its account
  const result = await request.server.db
    .select({
      giftCard: {
        id: giftCards.id,
        code: giftCards.code,
        name: giftCards.name,
        companyId: giftCards.companyId,
        createdAt: giftCards.createdAt
      },
      account: {
        id: accounts.id,
        companyId: accounts.companyId,
        type: accounts.type
      }
    })
    .from(giftCards)
    .innerJoin(
      accounts,
      and(
        eq(accounts.giftCardId, giftCards.id),
        eq(accounts.type, ACCOUNT_TYPES.GIFT_CARD),
        isNull(accounts.deletedAt)
      )
    )
    .where(and(eq(giftCards.code, code), isNull(giftCards.deletedAt)))
    .limit(1)

  if (result.length === 0) {
    reply.code(404)
    throw new Error('Gift card not found')
  }

  const { giftCard, account } = result[0]

  // Attach data to request as separate objects
  request.giftCard = giftCard
  request.account = account
  request.company = { id: account.companyId }
}
