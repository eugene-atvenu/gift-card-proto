export const getAllCompanyAccounts = async (
  db_client,
  company_id,
  include_gc = false
) => {
  const typeFilter = include_gc ? '' : "AND a.type != 'gift_card'"

  const { rows } = await db_client.query(
    `SELECT a.id, a.type, a.allowed_credit, a.gift_card_id, a.created_at
     FROM accounts a
     WHERE a.company_id = $1 AND a.deleted_at IS NULL ${typeFilter}`,
    [company_id]
  )

  const grouped = rows.reduce((acc, account) => {
    if (!acc[account.type]) {
      acc[account.type] = []
    }
    acc[account.type].push(account)
    return acc
  }, {})

  return grouped
}

export const ROLES = {
  ADMIN: 'admin',
  OWNER: 'owner',
  USER: 'user',
  ANY: 'any'
}
