import fp from 'fastify-plugin'
import { drizzle } from 'drizzle-orm/node-postgres'

async function drizzlePlugin(fastify, options) {
  const pool = fastify.pg.pool
  const db = drizzle(pool)

  fastify.decorate('db', db)

  fastify.addHook('onClose', async (instance) => {
    await pool.end()
  })
}

export default fp(drizzlePlugin, {
  name: 'drizzle'
})
