import { and, desc, eq, isNull, sql } from "drizzle-orm";

import {
	API_TOKEN_LAST_USED_THROTTLE_SECONDS,
	generateApiToken,
} from "../api-token";
import { db } from "../index";
import {
	type ApiTokenView,
	apiTokens,
	toApiTokenView,
} from "../schema/api-tokens";
import type { RepositoryNotFound } from "./repository-types";

export interface CreateApiTokenInput {
	name: string;
	userId: string;
}

export interface CreatedApiToken {
	plaintext: string;
	token: ApiTokenView;
}

export interface RevokeApiTokenInput {
	id: string;
	userId: string;
}

export type RevokeApiTokenResult =
	| RepositoryNotFound
	| { kind: "revoked"; token: ApiTokenView };

export interface ActiveApiToken {
	id: string;
	userId: string;
}

export async function createApiToken(
	input: CreateApiTokenInput
): Promise<CreatedApiToken> {
	const generated = await generateApiToken();
	const [row] = await db
		.insert(apiTokens)
		.values({
			name: input.name,
			prefix: generated.prefix,
			tokenHash: generated.tokenHash,
			userId: input.userId,
		})
		.returning();
	if (!row) {
		throw new Error("创建 API Token 失败：插入没有返回行");
	}
	return { plaintext: generated.plaintext, token: toApiTokenView(row) };
}

export function listApiTokensByUser(userId: string): Promise<ApiTokenView[]> {
	return db
		.select({
			createdAt: apiTokens.createdAt,
			id: apiTokens.id,
			lastUsedAt: apiTokens.lastUsedAt,
			name: apiTokens.name,
			prefix: apiTokens.prefix,
			revokedAt: apiTokens.revokedAt,
		})
		.from(apiTokens)
		.where(eq(apiTokens.userId, userId))
		.orderBy(desc(apiTokens.createdAt));
}

export async function revokeApiToken(
	input: RevokeApiTokenInput
): Promise<RevokeApiTokenResult> {
	const [row] = await db
		.update(apiTokens)
		.set({ revokedAt: sql`now()` })
		.where(
			and(
				eq(apiTokens.id, input.id),
				eq(apiTokens.userId, input.userId),
				isNull(apiTokens.revokedAt)
			)
		)
		.returning();
	return row
		? { kind: "revoked", token: toApiTokenView(row) }
		: { kind: "not-found" };
}

export async function findActiveApiTokenByHash(
	tokenHash: string
): Promise<ActiveApiToken | null> {
	const [row] = await db
		.select({ id: apiTokens.id, userId: apiTokens.userId })
		.from(apiTokens)
		.where(and(eq(apiTokens.tokenHash, tokenHash), isNull(apiTokens.revokedAt)))
		.limit(1);
	return row ?? null;
}

export async function touchApiTokenLastUsed(id: string): Promise<void> {
	await db
		.update(apiTokens)
		.set({ lastUsedAt: sql`now()` })
		.where(
			and(
				eq(apiTokens.id, id),
				sql`(${apiTokens.lastUsedAt} is null or ${apiTokens.lastUsedAt} < now() - (${API_TOKEN_LAST_USED_THROTTLE_SECONDS} || ' seconds')::interval)`
			)
		);
}
