import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'

const JWT_SECRET =
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export async function authenticate(request, reply) {
  const authHeader = request.headers.authorization
  const apiKey = request.headers['api-key']
  const apiSecret = request.headers['api-secret']

  // Check for Bearer Token
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7)
      const decoded = jwt.verify(token, JWT_SECRET)
      request.user = decoded
      return
    } catch (err) {
      reply.code(401)
      throw new Error('Invalid or expired token')
    }
  }

  // Check for API Key/Secret
  if (apiKey && apiSecret) {
    const client = await request.server.pg.connect()
    try {
      const { rows } = await client.query(
        'SELECT user_id, secret_hash FROM api_keys WHERE key_id = $1',
        [apiKey]
      )

      if (rows.length === 0) {
        reply.code(401)
        throw new Error('Invalid API credentials')
      }

      const { user_id, secret_hash } = rows[0]
      const isValid = await bcrypt.compare(apiSecret, secret_hash)

      if (!isValid) {
        reply.code(401)
        throw new Error('Invalid API credentials')
      }

      // Update last_used_at
      await client.query(
        'UPDATE api_keys SET last_used_at = NOW() WHERE key_id = $1',
        [apiKey]
      )

      // Set user context (mimicking JWT payload structure)
      request.user = { id: user_id }
      return
    } catch (err) {
      // Handle potential DB errors (e.g. invalid UUID format)
      if (err.message === 'Invalid API credentials') {
        throw err
      }
      request.log.error(err)
      reply.code(401)
      throw new Error('Authentication failed')
    } finally {
      client.release()
    }
  }

  reply.code(401)
  throw new Error('No authentication provided')
}
