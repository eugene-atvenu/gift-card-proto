import { relations } from "drizzle-orm/relations";
import { companies, accounts, giftCards, ledgerEntries, hyper54ChunkInTimescaledbInternal, hyper55ChunkInTimescaledbInternal, ledger, userCompanies, users } from "./schema";

export const accountsRelations = relations(accounts, ({one, many}) => ({
	company: one(companies, {
		fields: [accounts.companyId],
		references: [companies.id]
	}),
	giftCard: one(giftCards, {
		fields: [accounts.giftCardId],
		references: [giftCards.id]
	}),
	ledgerEntries: many(ledgerEntries),
}));

export const companiesRelations = relations(companies, ({many}) => ({
	accounts: many(accounts),
	giftCards: many(giftCards),
	userCompanies: many(userCompanies),
	ledgers: many(ledger),
}));

export const giftCardsRelations = relations(giftCards, ({one, many}) => ({
	accounts: many(accounts),
	company: one(companies, {
		fields: [giftCards.companyId],
		references: [companies.id]
	}),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({one}) => ({
	account: one(accounts, {
		fields: [ledgerEntries.accountId],
		references: [accounts.id]
	}),
	hyper54ChunkInTimescaledbInternal: one(hyper54ChunkInTimescaledbInternal, {
		fields: [ledgerEntries.ledgerId],
		references: [hyper54ChunkInTimescaledbInternal.id]
	}),
	hyper55ChunkInTimescaledbInternal: one(hyper55ChunkInTimescaledbInternal, {
		fields: [ledgerEntries.ledgerId],
		references: [hyper55ChunkInTimescaledbInternal.id]
	}),
	ledger: one(ledger, {
		fields: [ledgerEntries.ledgerId],
		references: [ledger.id]
	}),
}));

export const hyper54ChunkInTimescaledbInternalRelations = relations(hyper54ChunkInTimescaledbInternal, ({many}) => ({
	ledgerEntries: many(ledgerEntries),
}));

export const hyper55ChunkInTimescaledbInternalRelations = relations(hyper55ChunkInTimescaledbInternal, ({many}) => ({
	ledgerEntries: many(ledgerEntries),
}));

export const ledgerRelations = relations(ledger, ({one, many}) => ({
	ledgerEntries: many(ledgerEntries),
	company: one(companies, {
		fields: [ledger.companyId],
		references: [companies.id]
	}),
}));

export const userCompaniesRelations = relations(userCompanies, ({one}) => ({
	company: one(companies, {
		fields: [userCompanies.companyId],
		references: [companies.id]
	}),
	user: one(users, {
		fields: [userCompanies.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	userCompanies: many(userCompanies),
}));