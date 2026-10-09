import {
	createCasdoorUser,
	updateCasdoorUser,
} from "@automationstack/db/repositories/casdoor-users-repository";
import {
	getUserByExternalId,
	getUserByUsername,
} from "@automationstack/db/repositories/users-repository";
import type { User } from "@automationstack/db/schema/users";

import type { CasdoorIdentity } from "./claims";

export type LoginUserOutcome =
	| { kind: "disabled" }
	| { kind: "ok"; user: User }
	| { kind: "username-conflict" };

export type WarnLog = (message: string) => void;

async function usernameAfterRename(
	user: User,
	identity: CasdoorIdentity,
	warn: WarnLog
): Promise<string> {
	if (identity.username === user.username) {
		return user.username;
	}
	const holder = await getUserByUsername(identity.username);
	if (holder === null || holder.id === user.id) {
		return identity.username;
	}
	warn(
		`Casdoor 用户「${user.username}」（id ${identity.externalId}）改名为「${identity.username}」，但这个用户名已被另一个本地账号使用。保留原用户名。`
	);
	return user.username;
}

async function syncExistingUser(
	user: User,
	identity: CasdoorIdentity,
	warn: WarnLog
): Promise<LoginUserOutcome> {
	// Casdoor 登录成功不清除本地的 disabled_at。只有 webhook 和对账可以清除它（T10）。
	if (user.disabledAt !== null || user.authSource !== "casdoor") {
		return { kind: "disabled" };
	}
	const username = await usernameAfterRename(user, identity, warn);
	const updated = await updateCasdoorUser(user.id, {
		role: identity.role,
		username,
	});
	return updated === null
		? { kind: "disabled" }
		: { kind: "ok", user: updated };
}

async function createNewUser(
	identity: CasdoorIdentity,
	warn: WarnLog
): Promise<LoginUserOutcome> {
	const created = await createCasdoorUser(identity);
	if (created !== null) {
		return { kind: "ok", user: created };
	}
	// 同一用户同时登录两次时，另一个请求可能已经创建了这一行。
	const raced = await getUserByExternalId(identity.externalId);
	if (raced !== null) {
		return await syncExistingUser(raced, identity, warn);
	}
	warn(
		`Casdoor 用户「${identity.username}」（id ${identity.externalId}）第一次登录失败：本地已有同名账号。请先修改本地账号的用户名。`
	);
	return { kind: "username-conflict" };
}

/**
 * 按 external_id 匹配或创建本地用户（plan 021 D6），并覆盖同步角色（D4）。
 * 不按用户名关联已有的本地账号。
 */
export async function upsertCasdoorLoginUser(
	identity: CasdoorIdentity,
	warn: WarnLog = console.warn
): Promise<LoginUserOutcome> {
	const existing = await getUserByExternalId(identity.externalId);
	if (existing !== null) {
		return await syncExistingUser(existing, identity, warn);
	}
	return await createNewUser(identity, warn);
}
