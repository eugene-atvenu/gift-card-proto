import { ACCOUNT_TYPES } from '../constants.js'

export const getGiftCardAccountByCode = async (db_client, code) => {
  const { rows: cardRows } = await db_client.query(
    `SELECT gc.id, gc.code, gc.name, gc.company_id, gc.created_at, a.id as account_id
           FROM gift_cards gc
           JOIN accounts a ON a.gift_card_id = gc.id AND a.type = $1
           WHERE gc.code = $2 AND gc.deleted_at IS NULL AND a.deleted_at IS NULL`,
    [ACCOUNT_TYPES.GIFT_CARD, code]
  )

  if (cardRows.length === 0) {
    return null
  }

  return cardRows[0]
}
