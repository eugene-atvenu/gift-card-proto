import jwt from 'jsonwebtoken'

const JWT_SECRET =
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export async function authenticateUser(request, reply) {
  try {
    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.code(401)
      throw new Error('No token provided')
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET)
    request.user = decoded
  } catch (err) {
    reply.code(401)
    throw new Error('Invalid or expired token')
  }
}
