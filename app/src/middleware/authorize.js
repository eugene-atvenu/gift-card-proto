import { eq, and } from 'drizzle-orm'
import { userCompanies } from '../db/schema.js'
import { ROLES } from '../helpers/company.helper.js'

export function authorize(allowedRoles = []) {
  return async (request, reply) => {
    const companyId = request.company.id
    console.log('Authorizing user', request.user.id, 'for company', companyId)

    const results = await request.server.db
      .select({ role: userCompanies.role })
      .from(userCompanies)
      .where(
        and(
          eq(userCompanies.userId, request.user.id),
          eq(userCompanies.companyId, companyId)
        )
      )

    if (!results.length) {
      reply.code(403)
      throw new Error('Insufficient permissions')
    }

    if (!allowedRoles.length || allowedRoles.includes(ROLES.ANY)) {
      return
    }

    const userRoles = results.map((r) => r.role)
    const hasPermission = userRoles.some((role) => allowedRoles.includes(role))

    if (!hasPermission) {
      reply.code(403)
      throw new Error('Insufficient permissions')
    }
  }
}
