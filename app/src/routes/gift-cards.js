import { ACCOUNT_TYPES } from '../constants.js'
import { getAccountBalance } from '../helpers/accounts.helper.js'
import { authenticate } from '../middleware/authenticate.js'
import { authorize } from '../middleware/authorize.js'
import { loadGiftCard } from '../middleware/gift-card.js'

export default async function giftCardsRoutes(fastify, options) {
  // GET gift card balance by code
  fastify.get(
    '/gift-cards/:code/balance',
    { preHandler: [authenticate, loadGiftCard, authorize()] },
    async (request, reply) => {
      const client = await fastify.pg.connect()
      try {
        const balance = await getAccountBalance(client, request.account.id)

        return {
          code: request.giftCard.code,
          name: request.giftCard.name,
          company_id: request.company.id,
          balance: balance,
          created_at: request.giftCard.createdAt
        }
      } finally {
        client.release()
      }
    }
  )

  // POST spend from gift card
  fastify.post(
    '/gift-cards/:code/spend',
    { preHandler: [authenticate, loadGiftCard, authorize()] },
    async (request, reply) => {
      const { amount } = request.body

      if (!amount || amount <= 0) {
        reply.code(400)
        return { error: 'Amount must be greater than 0' }
      }

      const client = await fastify.pg.connect()
      try {
        await client.query('BEGIN')

        // Check current balance
        const currentBalance = await getAccountBalance(
          client,
          request.account.id
        )

        if (currentBalance < amount) {
          reply.code(400)
          return {
            error: 'Insufficient balance',
            current_balance: currentBalance,
            requested_amount: amount
          }
        }

        // Get generic_out account for the company
        const {
          rows: [outAccount]
        } = await client.query(
          'SELECT id FROM accounts WHERE company_id = $1 AND type = $2 AND deleted_at IS NULL',
          [request.company.id, ACCOUNT_TYPES.GENERIC_OUT]
        )

        // Get current timestamp for ledger
        const now = new Date()

        // Create ledger record
        const { rows: ledgerRows } = await client.query(
          'INSERT INTO ledger (company_id, description, time) VALUES ($1, $2, $3) RETURNING id, time',
          [
            request.company.id,
            `Gift card ${request.giftCard.code} spend ${amount}`,
            now
          ]
        )
        const ledger = ledgerRows[0]

        // Create both ledger entries (gift card debited, out account credited)
        const debitEntry = [ledger.id, ledger.time, request.account.id, -amount]
        const creditEntry = [ledger.id, ledger.time, outAccount.id, amount]

        await client.query(
          `INSERT INTO ledger_entries (ledger_id, ledger_time, account_id, amount)
           VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)`,
          [...debitEntry, ...creditEntry]
        )

        await client.query('COMMIT')

        const newBalance = currentBalance - amount

        return {
          code: request.giftCard.code,
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
    }
  )

  // POST add funds to gift card
  fastify.post(
    '/gift-cards/:code/add-funds',
    { preHandler: [authenticate, loadGiftCard, authorize()] },
    async (request, reply) => {
      const { amount } = request.body

      if (!amount || amount <= 0) {
        reply.code(400)
        return { error: 'Amount must be greater than 0' }
      }

      const client = await fastify.pg.connect()
      const now = new Date()

      try {
        await client.query('BEGIN')

        const currentBalance = await getAccountBalance(
          client,
          request.account.id
        )

        // Get generic_in account for the company
        const {
          rows: [inAccount]
        } = await client.query(
          'SELECT id FROM accounts WHERE company_id = $1 AND type = $2 AND deleted_at IS NULL',
          [request.company.id, ACCOUNT_TYPES.GENERIC_IN]
        )

        // Create ledger record
        const {
          rows: [ledger]
        } = await client.query(
          'INSERT INTO ledger (company_id, description, time) VALUES ($1, $2, $3) RETURNING id, time',
          [
            request.company.id,
            `Gift card ${request.giftCard.code} add funds ${amount}`,
            now
          ]
        )

        // Create ledger entries (in account debited, gift card credited)
        const debitEntry = [ledger.id, ledger.time, inAccount.id, -amount]
        const creditEntry = [ledger.id, ledger.time, request.account.id, amount]

        await client.query(
          `INSERT INTO ledger_entries (ledger_id, ledger_time, account_id, amount)
           VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)`,
          [...debitEntry, ...creditEntry]
        )

        await client.query('COMMIT')

        return {
          code: request.giftCard.code,
          transaction: {
            amount,
            previous_balance: currentBalance,
            new_balance: currentBalance + amount,
            timestamp: ledger.time
          }
        }
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    }
  )

  // GET gift card transaction history
  fastify.get(
    '/gift-cards/:code/transactions',
    { preHandler: [authenticate, loadGiftCard, authorize()] },
    async (request, reply) => {
      const client = await fastify.pg.connect()
      try {
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
          [request.account.id]
        )

        return {
          code: request.giftCard.code,
          name: request.giftCard.name,
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
    }
  )
}
