import { ACCOUNT_TYPES } from '../constants.js'
import crypto from 'crypto'
import { getAccountBalance } from '../helpers/accounts.helper.js'
import { getGiftCardAccountByCode } from '../helpers/gift-cards.helpers.js'
import { accounts, giftCards, ledger, ledgerEntries } from '../db/schema.js'
import { and, eq, isNull } from 'drizzle-orm'

function generateGiftCardCode() {
  return crypto.randomBytes(16).toString('hex').toUpperCase()
}

export default async function giftCardsRoutes(fastify, options) {
  fastify.post('/gift-cards', async (request, reply) => {
    const { company_id, quantity, amount, name, description } = request.body

    if (!company_id || !quantity || !amount) {
      reply.code(400)
      return { error: 'company_id, quantity, and amount are required' }
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
            eq(accounts.companyId, company_id),
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
          companyId: company_id,
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
        companyId: company_id,
        giftCardId: c.id,
        createdAt: now
      }))

      const insertedAccounts = await tx
        .insert(accounts)
        .values(giftCardAccountsData)
        .returning({ id: accounts.id, giftCardId: accounts.giftCardId })

      const ledgerData = insertedCards.map((c) => ({
        companyId: company_id,
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
  })

  // GET gift card balance by code
  fastify.get('/gift-cards/:code/balance', async (request, reply) => {
    const { code } = request.params

    const client = await fastify.pg.connect()
    try {
      const card = await getGiftCardAccountByCode(client, code)

      if (!card) {
        reply.code(404)
        return { error: 'Gift card not found' }
      }

      const balance = await getAccountBalance(client, card.account_id)

      return {
        code: card.code,
        name: card.name,
        company_id: card.company_id,
        balance: balance,
        created_at: card.created_at
      }
    } finally {
      client.release()
    }
  })

  // POST spend from gift card
  fastify.post('/gift-cards/:code/spend', async (request, reply) => {
    const { code } = request.params
    const { amount } = request.body

    if (!amount || amount <= 0) {
      reply.code(400)
      return { error: 'Amount must be greater than 0' }
    }

    const client = await fastify.pg.connect()
    try {
      await client.query('BEGIN')

      const card = await getGiftCardAccountByCode(client, code)

      if (!card) {
        reply.code(404)
        return { error: 'Gift card not found' }
      }

      // Check current balance
      const currentBalance = await getAccountBalance(client, card.account_id)

      if (currentBalance < amount) {
        reply.code(400)
        return {
          error: 'Insufficient balance',
          current_balance: currentBalance,
          requested_amount: amount
        }
      }

      // Get or create generic_out account for the company
      let { rows: outAccountRows } = await client.query(
        'SELECT id FROM accounts WHERE company_id = $1 AND type = $2 AND deleted_at IS NULL',
        [card.company_id, ACCOUNT_TYPES.GENERIC_OUT]
      )

      let outAccountId
      if (outAccountRows.length === 0) {
        // Create generic_out account if it doesn't exist
        const { rows: newAccountRows } = await client.query(
          'INSERT INTO accounts (type, company_id, created_at) VALUES ($1, $2, NOW()) RETURNING id',
          [ACCOUNT_TYPES.GENERIC_OUT, card.company_id]
        )
        outAccountId = newAccountRows[0].id
      } else {
        outAccountId = outAccountRows[0].id
      }

      // Get current timestamp for ledger
      const now = new Date()

      // Create ledger record
      const { rows: ledgerRows } = await client.query(
        'INSERT INTO ledger (company_id, description, time) VALUES ($1, $2, $3) RETURNING id, time',
        [card.company_id, `Gift card ${code} spend ${amount}`, now]
      )
      const ledger = ledgerRows[0]

      // Create both ledger entries (gift card debited, out account credited)
      await client.query(
        `INSERT INTO ledger_entries (ledger_id, ledger_time, account_id, amount)
         VALUES ($1, $2, $3, $4), ($1, $2, $5, $6)`,
        [ledger.id, ledger.time, card.account_id, -amount, outAccountId, amount]
      )

      await client.query('COMMIT')

      const newBalance = currentBalance - amount

      return {
        code: card.code,
        transaction: {
          amount: amount,
          previous_balance: currentBalance,
          new_balance: newBalance,
          timestamp: ledger.time
        }
      }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })

  // POST add funds to gift card
  fastify.post('/gift-cards/:code/add-funds', async (request, reply) => {
    const { code } = request.params
    const { amount } = request.body

    if (!amount || amount <= 0) {
      reply.code(400)
      return { error: 'Amount must be greater than 0' }
    }

    const client = await fastify.pg.connect()
    const gc_account = await getGiftCardAccountByCode(client, code)

    if (!gc_account) {
      reply.code(404)
      return { error: 'Gift card not found' }
    }

    try {
      await client.query('BEGIN')

      const currentBalance = await getAccountBalance(
        client,
        gc_account.account_id
      )

      // Get or create generic_in account for the company
      let { rows: inAccountRows } = await client.query(
        'SELECT id FROM accounts WHERE company_id = $1 AND type = $2 AND deleted_at IS NULL',
        [gc_account.company_id, ACCOUNT_TYPES.GENERIC_IN]
      )

      let inAccountId
      if (inAccountRows.length === 0) {
        // Create generic_in account if it doesn't exist
        const { rows: newAccountRows } = await client.query(
          'INSERT INTO accounts (type, company_id, created_at) VALUES ($1, $2, NOW()) RETURNING id',
          [ACCOUNT_TYPES.GENERIC_IN, gc_account.company_id]
        )
        inAccountId = newAccountRows[0].id
      } else {
        inAccountId = inAccountRows[0].id
      }

      // Get current timestamp for ledger
      const now = new Date()

      // Create ledger record
      const { rows: ledgerRows } = await client.query(
        'INSERT INTO ledger (company_id, description, time) VALUES ($1, $2, $3) RETURNING id, time',
        [gc_account.company_id, `Gift card ${code} add funds ${amount}`, now]
      )
      const ledger = ledgerRows[0]

      // Create both ledger entries (in account debited, gift card credited)
      await client.query(
        `INSERT INTO ledger_entries (ledger_id, ledger_time, account_id, amount)
         VALUES ($1, $2, $3, $4), ($1, $2, $5, $6)`,
        [
          ledger.id,
          ledger.time,
          inAccountId,
          -amount,
          gc_account.account_id,
          amount
        ]
      )

      await client.query('COMMIT')

      const newBalance = currentBalance + amount

      return {
        code: gc_account.code,
        transaction: {
          amount: amount,
          previous_balance: currentBalance,
          new_balance: newBalance,
          timestamp: ledger.time
        }
      }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })

  // GET gift card transaction history
  fastify.get('/gift-cards/:code/transactions', async (request, reply) => {
    const { code } = request.params

    const client = await fastify.pg.connect()
    try {
      // Get gift card and its account
      const { rows: cardRows } = await client.query(
        `SELECT gc.id, gc.code, gc.name, gc.company_id, a.id as account_id
         FROM gift_cards gc
         JOIN accounts a ON a.gift_card_id = gc.id AND a.type = $1
         WHERE gc.code = $2 AND gc.deleted_at IS NULL AND a.deleted_at IS NULL`,
        [ACCOUNT_TYPES.GIFT_CARD, code]
      )

      if (cardRows.length === 0) {
        reply.code(404)
        return { error: 'Gift card not found' }
      }

      const card = cardRows[0]

      // Get transaction history with running balance
      const { rows: transactions } = await client.query(
        `SELECT
          l.id as ledger_id,
          l.time as timestamp,
          l.description,
          le.amount,
          SUM(le.amount) OVER (ORDER BY l.time, l.id) as running_balance
         FROM ledger_entries le
         JOIN ledger l ON l.id = le.ledger_id AND l.time = le.ledger_time
         WHERE le.account_id = $1
         ORDER BY l.time DESC, l.id DESC`,
        [card.account_id]
      )

      return {
        code: card.code,
        name: card.name,
        transactions: transactions.map((t) => ({
          timestamp: t.timestamp,
          description: t.description,
          amount: parseFloat(t.amount),
          balance_after: parseFloat(t.running_balance)
        }))
      }
    } finally {
      client.release()
    }
  })
}
