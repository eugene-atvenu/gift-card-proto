export const getAccountBalance = async (db_client, account_id) => {
  const { rows: balanceRows } = await db_client.query(
    `SELECT COALESCE(SUM(le.amount), 0) as balance
           FROM ledger_entries le
           WHERE le.account_id = $1`,
    [account_id]
  )

  return parseFloat(balanceRows[0].balance, 10)
}

export const canSpendAmount = async (db_client, account, amount) => {
  const balance = await getAccountBalance(db_client, account.account_id)
  return account.allowed_credit
    ? balance + account.allowed_credit >= amount
    : balance >= amount
}
