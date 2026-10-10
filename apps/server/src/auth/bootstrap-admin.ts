import { isLocalLoginEnabled } from "@automationstack/api/auth/providers/resolve";
import { getEffectiveAuthSettings } from "@automationstack/api/auth/settings-store";
import { localLoginAdminBlocker } from "@automationstack/db/local-login";
import { hashPassword } from "@automationstack/db/password";
import {
	countLocalLoginAdmins,
	createUser,
	getUserByUsername,
} from "@automationstack/db/repositories/users-repository";
import { env } from "@automationstack/env/server";

import {
	type BootstrapAdminDecision,
	decideBootstrapAdmin,
} from "./bootstrap-admin-core";

export class BootstrapAdminError extends Error {
	override name = "BootstrapAdminError";
}

export interface BootstrapAdminLogger {
	info: (message: string) => void;
	warn: (message: string) => void;
}

async function readExistingUserBlocker(username: string) {
	const user = await getUserByUsername(username);
	return user === null ? null : localLoginAdminBlocker(user);
}

async function createBootstrapAdmin(
	username: string,
	decision: Extract<BootstrapAdminDecision, { kind: "create" }>,
	logger: BootstrapAdminLogger
): Promise<void> {
	const user = await createUser({
		mustChangePassword: decision.mustChangePassword,
		passwordHash: await hashPassword(decision.password),
		role: "admin",
		username,
	});
	if (user === null) {
		logger.info(
			`引导管理员「${username}」已由另一个服务实例创建，本实例不再创建。`
		);
		return;
	}
	// 创建管理员是破窗操作，用 warn 级别记录，便于审计。不写密码。
	logger.warn(
		decision.mustChangePassword
			? `[审计] 已创建引导管理员「${username}」。第一次登录后必须修改密码。`
			: `[审计] 已创建引导管理员「${username}」。`
	);
}

/**
 * 服务启动时创建引导管理员（plan 021 D2）。必须在 serve() 之前 await。
 * 生产环境的配置错误抛出 BootstrapAdminError，调用方以非零码退出。
 * 日志不写密码。
 * 本地登录是否启用取当前生效的认证设置（页面配置优先于环境变量，plan 021 §10）。
 * 否则页面已切换到 casdoor 并关闭本地登录时，服务会按环境变量要求引导管理员的密码。
 */
export async function bootstrapAdmin(
	logger: BootstrapAdminLogger
): Promise<void> {
	const localLoginEnabled = isLocalLoginEnabled(
		await getEffectiveAuthSettings()
	);
	const localLoginAdminCount = localLoginEnabled
		? await countLocalLoginAdmins()
		: 0;
	const username = env.ADMIN_USERNAME;
	const needsUsernameCheck = localLoginEnabled && localLoginAdminCount === 0;
	const decision = decideBootstrapAdmin({
		existingUserBlocker: needsUsernameCheck
			? await readExistingUserBlocker(username)
			: null,
		initialPassword: env.ADMIN_INITIAL_PASSWORD,
		localLoginAdminCount,
		localLoginEnabled,
		production: env.NODE_ENV === "production",
		username,
	});

	if (decision.kind === "skip") {
		return;
	}
	if (decision.kind === "warn") {
		logger.warn(`引导管理员：已跳过。${decision.message}`);
		return;
	}
	if (decision.kind === "fail") {
		throw new BootstrapAdminError(decision.message);
	}
	await createBootstrapAdmin(username, decision, logger);
}
