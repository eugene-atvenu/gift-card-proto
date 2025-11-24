import Fastify from 'fastify'
import postgres from '@fastify/postgres'
import drizzlePlugin from './plugins/drizzle.js'
import companiesRoutes from './routes/companies.js'
import companyUsersRoutes from './routes/company-users.js'
import companyGiftCardsRoutes from './routes/company-giftcards.js'
import usersRoutes from './routes/users.js'
import giftCardsRoutes from './routes/gift-cards.js'
import 'dotenv/config'

const fastify = Fastify({ logger: true }) // Enable logger for dev

// Register PostgreSQL plugin
fastify.register(postgres, {
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://admin:adminpassword@localhost:5832/gift_cards_db'
})

// Register Drizzle plugin
fastify.register(drizzlePlugin)

// Register routes
fastify.register(companiesRoutes)
fastify.register(companyUsersRoutes)
fastify.register(companyGiftCardsRoutes)
fastify.register(usersRoutes)
fastify.register(giftCardsRoutes)

// Declare a route
fastify.get('/', async (request, reply) => {
  return { message: 'welcome' }
})

fastify.get('/health', async (request, reply) => {
  return { status: 'ok' }
})

fastify.get('/env', async (request, reply) => {
  return process.env
})

const PORT = process.env.PORT || 3000

// Start the server
const start = async () => {
  try {
    await fastify.listen({ port: PORT })
    console.log(`Server is running at http://localhost:${PORT}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
