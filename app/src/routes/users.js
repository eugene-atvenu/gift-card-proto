import bcrypt from 'bcrypt'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { authenticate } from '../middleware/authenticate.js'

const JWT_SECRET =
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
const SALT_ROUNDS = 12

export default async function usersRoutes(fastify, options) {
  // POST /register - Register a new user
  fastify.post('/register', async (request, reply) => {
    const { username, email, password } = request.body

    if (!username || !email || !password) {
      reply.code(400)
      return { error: 'Username, email, and password are required' }
    }

    const client = await fastify.pg.connect()
    try {
      // Check if user already exists
      const { rows: existingUsers } = await client.query(
        'SELECT id FROM users WHERE username = $1 OR email = $2',
        [username, email]
      )

      if (existingUsers.length > 0) {
        reply.code(409)
        return { error: 'Username or email already exists' }
      }

      // Hash password
      const password_hash = await bcrypt.hash(password, SALT_ROUNDS)

      // Create user
      const { rows } = await client.query(
        'INSERT INTO users (username, email, password_hash, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, username, email, created_at',
        [username, email, password_hash]
      )

      const user = rows[0]

      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, username: user.username, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      )

      reply.code(201)
      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          created_at: user.created_at
        },
        token
      }
    } finally {
      client.release()
    }
  })

  // POST /login - Login user
  fastify.post('/login', async (request, reply) => {
    const { username, password } = request.body

    if (!username || !password) {
      reply.code(400)
      return { error: 'Username and password are required' }
    }

    const client = await fastify.pg.connect()
    try {
      const { rows } = await client.query(
        'SELECT id, username, email, password_hash, created_at FROM users WHERE username = $1 AND deleted_at IS NULL',
        [username]
      )

      if (rows.length === 0) {
        reply.code(401)
        return { error: 'Invalid username or password' }
      }

      const user = rows[0]

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash)

      if (!isValidPassword) {
        reply.code(401)
        return { error: 'Invalid username or password' }
      }

      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, username: user.username, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      )

      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          created_at: user.created_at
        },
        token
      }
    } finally {
      client.release()
    }
  })

  // PATCH /profile - Update user profile (requires authentication)
  fastify.patch(
    '/profile',
    { preHandler: authenticate },
    async (request, reply) => {
      const { profile } = request.body

      if (!profile) {
        reply.code(400)
        return { error: 'Profile field is required' }
      }

      const client = await fastify.pg.connect()
      try {
        const { rows } = await client.query(
          'UPDATE users SET profile = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING id, username, email, profile, created_at',
          [profile, request.user.id]
        )

        if (rows.length === 0) {
          reply.code(404)
          return { error: 'User not found' }
        }

        return { user: rows[0] }
      } finally {
        client.release()
      }
    }
  )

  // DELETE /profile - Soft delete user account (requires authentication)
  fastify.delete('/', { preHandler: authenticate }, async (request, reply) => {
    const client = await fastify.pg.connect()
    try {
      const { rows } = await client.query(
        'UPDATE users SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
        [request.user.id]
      )

      if (rows.length === 0) {
        reply.code(404)
        return { error: 'User not found' }
      }

      reply.code(204)
      return
    } finally {
      client.release()
    }
  })

  // GET /profile - Get current user profile (requires authentication)
  fastify.get(
    '/profile',
    { preHandler: authenticate },
    async (request, reply) => {
      const client = await fastify.pg.connect()
      try {
        const { rows } = await client.query(
          'SELECT id, username, email, profile, created_at FROM users WHERE id = $1 AND deleted_at IS NULL',
          [request.user.id]
        )

        if (rows.length === 0) {
          reply.code(404)
          return { error: 'User not found' }
        }

        return { user: rows[0] }
      } finally {
        client.release()
      }
    }
  )

  // POST /api-keys - Generate a new API key
  fastify.post(
    '/api-keys',
    { preHandler: authenticate },
    async (request, reply) => {
      const { label } = request.body || {}
      const userId = request.user.id

      // Generate a random 32-char secret
      const secret = crypto.randomBytes(16).toString('hex') // 16 bytes = 32 hex chars

      // Hash the secret
      const secretHash = await bcrypt.hash(secret, SALT_ROUNDS)

      const client = await fastify.pg.connect()
      try {
        // Insert into api_keys
        // We let the DB generate the UUID v7 key
        const { rows } = await client.query(
          `INSERT INTO api_keys (user_id, secret_hash, label)
           VALUES ($1, $2, $3)
           RETURNING key_id as key, created_at`,
          [userId, secretHash, label]
        )

        const newKey = rows[0]

        return {
          key: newKey.key,
          secret: secret,
          label: label,
          createdAt: newKey.created_at
        }
      } finally {
        client.release()
      }
    }
  )
}
