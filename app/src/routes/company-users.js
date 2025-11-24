import { and, eq, isNull } from 'drizzle-orm'
import { users, userCompanies } from '../db/schema.js'
import { ROLES } from '../helpers/company.helper.js'
import { authenticate } from '../middleware/authenticate.js'
import { authorize } from '../middleware/authorize.js'
import { loadCompany } from '../middleware/company.js'

export default async function companyUsersRoutes(fastify) {
  fastify.post(
    '/companies/:id/users',
    { preHandler: [authenticate, loadCompany, authorize([ROLES.OWNER, ROLES.ADMIN])] },
    async (request, reply) => {
      const { user_id, role } = request.body

      if (!user_id || !role) {
        reply.code(400)
        return { error: 'user_id and role are required' }
      }

      if (![ROLES.USER, ROLES.ADMIN].includes(role)) {
        reply.code(400)
        return {
          error: `Role must be either "${ROLES.USER}" or "${ROLES.ADMIN}"`
        }
      }

      // Check if user exists
      const [user] = await fastify.db
        .select()
        .from(users)
        .where(and(eq(users.id, user_id), isNull(users.deletedAt)))
        .limit(1)

      if (!user) {
        reply.code(404)
        return { error: 'User not found' }
      }

      // Check if user already has this role in the company
      const existing = await fastify.db
        .select()
        .from(userCompanies)
        .where(
          and(
            eq(userCompanies.userId, user_id),
            eq(userCompanies.companyId, request.company.id),
            eq(userCompanies.role, role)
          )
        )
        .limit(1)

      if (existing.length > 0) {
        reply.code(409)
        return { error: 'User already has this role in the company' }
      }

      // Add user to company
      await fastify.db.insert(userCompanies).values({
        userId: user_id,
        companyId: request.company.id,
        role
      })

      reply.code(201)
      return { message: 'User added to company successfully' }
    }
  )
}
