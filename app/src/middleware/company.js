import { and, eq, isNull } from 'drizzle-orm'
import { companies } from '../db/schema.js'

export async function loadCompany(request, reply) {
  const { id } = request.params

  if (!id) {
    reply.code(400)
    throw new Error('Company id is required')
  }

  const companyId = parseInt(id, 10)
  if (Number.isNaN(companyId)) {
    reply.code(400)
    throw new Error('Company id must be a valid number')
  }

  // Check if company exists in database
  const [company] = await request.server.db
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)))
    .limit(1)

  if (!company) {
    reply.code(404)
    throw new Error('Company not found')
  }

  // Attach company data to request
  request.company = company
}
