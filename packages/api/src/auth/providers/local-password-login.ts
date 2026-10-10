import { localPasswordHashOf } from "@automationstack/db/local-login";
import { verifyPassword } from "@automationstack/db/password";
import { getUserByUsername } from "@automationstack/db/repositories/users-repository";
import type { User } from "@automationstack/db/schema/users";

import {
	checkLoginGate,
	recordLoginFailure,
	recordLoginSuccess,
	runInVerificationSlot,
} from "../../lib/login-rate-limit";
import type { LocalLoginPolicy } from "./types";

// 账号不存在或没有本地密码时，用这个哈希校验一次，响应时间与密码错误相同。
const DECOY_HASH =
	"pbkdf2_sha256$600000$LKdUtr/BOB3WfkBHwScmTA==$IxU7PLMzoWj+YBo4tw7g2ZgkA7NoMq0m4SsNeRE5k2Y=";

export interface LocalLoginInput {
	clientIp: string | null;
	password: string;
	/** 已去掉首尾空白的用户名。 */
	username: string;
}

export type LocalLoginOutcome =
	| { kind: "disabled" }
	| { kind: "ok"; user: User }
	| { kind: "rate-limited" }
	| { kind: "rejected" };

export type LocalLoginAuditLog = (message: string) => void;

function policyAllows(policy: LocalLoginPolicy, user: User): boolean {
	return policy === "all-local-accounts" || user.role === "admin";
}

function isAuthenticated(
	user: User | null,
	storedHash: string | null,
	passwordMatches: boolean
): user is User {
	return (
		user !== null &&
		storedHash !== null &&
		passwordMatches &&
		user.disabledAt === null
	);
}

/**
 * 本地密码登录。限流、诱饵哈希和「没有本地密码的账号不能登录」的规则与阶段 1 相同。
 * casdoor 模式（local-admins-only）下只有本地管理员可以登录，每次成功登录写审计日志（D15）。
 * 不符合开放范围的账号与密码错误返回相同的结果，防止枚举账号。
 */
export async function loginWithLocalPassword(
	input: LocalLoginInput,
	policy: LocalLoginPolicy,
	auditLog: LocalLoginAuditLog = console.warn
): Promise<LocalLoginOutcome> {
	if (policy === "disabled") {
		return { kind: "disabled" };
	}
	const attempt = { clientIp: input.clientIp, username: input.username };
	if (checkLoginGate(attempt).kind === "rejected") {
		return { kind: "rate-limited" };
	}
	const user = await getUserByUsername(input.username);
	const storedHash = user === null ? null : localPasswordHashOf(user);
	const verification = await runInVerificationSlot(() =>
		verifyPassword(input.password, storedHash ?? DECOY_HASH)
	);
	if (verification.kind === "saturated") {
		return { kind: "rate-limited" };
	}
	if (
		!(
			isAuthenticated(user, storedHash, verification.value) &&
			policyAllows(policy, user)
		)
	) {
		recordLoginFailure(attempt);
		return { kind: "rejected" };
	}
	recordLoginSuccess(attempt);
	if (policy === "local-admins-only") {
		auditLog(
			`[审计] Casdoor 模式下的本地密码登录（应急登录）：用户「${user.username}」。`
		);
	}
	return { kind: "ok", user };
}
