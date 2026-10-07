import { hashApiToken } from "@automationstack/db/api-token";
import {
	findActiveApiTokenByHash,
	touchApiTokenLastUsed,
} from "@automationstack/db/repositories/api-tokens-repository";
import { getUserById } from "@automationstack/db/repositories/users-repository";
import type { User } from "@automationstack/db/schema/users";

import { parseBearerToken } from "./bearer-token";

export async function resolveUserFromBearer(
	header: string | null | undefined
): Promise<User | null> {
	const plaintext = parseBearerToken(header);
	if (plaintext === null) {
		return null;
	}
	const token = await findActiveApiTokenByHash(await hashApiToken(plaintext));
	if (token === null) {
		return null;
	}
	const user = await getUserById(token.userId);
	if (user === null || user.disabledAt !== null) {
		return null;
	}
	touchApiTokenLastUsed(token.id).catch((error: unknown) => {
		console.error("更新 API Token 的 lastUsedAt 失败", error);
	});
	return user;
}
