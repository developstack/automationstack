import type { LocalProviderDefaults } from "@automationstack/db/repositories/auth-settings-repository";
import type {
	AuthProviderId,
	AuthSettingsRow,
} from "@automationstack/db/schema/auth-settings";

export const AUTH_SET_LOCAL_USAGE =
	"用法：tsx scripts/auth-set-local.ts（没有参数）。把认证方式改回 local。";

export interface AuthSetLocalDeps {
	/** 环境变量中的 Casdoor 默认值。没有 auth_settings 行时，用它们创建这一行。 */
	envDefaults: LocalProviderDefaults;
	/** 环境变量 AUTH_PROVIDER。 */
	envProvider: AuthProviderId;
	forceLocal: (defaults: LocalProviderDefaults) => Promise<unknown>;
	getRow: () => Promise<Pick<AuthSettingsRow, "provider"> | null>;
	log: (message: string) => void;
	warn: (message: string) => void;
}

export type AuthSetLocalResult =
	| { kind: "already-local" }
	| { kind: "error"; message: string }
	| { kind: "switched"; source: "database" | "env" };

/**
 * 运维命令 auth-set-local 的逻辑（plan 021 §10.5 第 5 项）。
 * 把认证方式改为 local，写一条修改记录（操作人为空）和一行 [审计] WARN 日志。
 * 已经是 local 时不修改数据。
 */
export async function runAuthSetLocal(
	args: readonly string[],
	deps: AuthSetLocalDeps
): Promise<AuthSetLocalResult> {
	if (args.length > 0) {
		return { kind: "error", message: AUTH_SET_LOCAL_USAGE };
	}
	const row = await deps.getRow();
	const current = row?.provider ?? deps.envProvider;
	const source = row === null ? "env" : "database";
	if (current === "local") {
		deps.log("认证方式已经是 local，没有修改。");
		return { kind: "already-local" };
	}
	await deps.forceLocal(deps.envDefaults);
	deps.warn(
		"[审计] auth-set-local：认证方式已从「casdoor」改为「local」。操作人：运维命令。"
	);
	if (source === "env") {
		deps.log(
			"数据库中原来没有认证设置，已用环境变量中的值创建。环境变量中的 Casdoor 密钥没有写入数据库，以后切换到 Casdoor 时需要在页面中重新填写。"
		);
	}
	deps.log(
		"运行中的服务最多 30 秒后使用新的认证方式。Casdoor 用户没有本地密码，需要管理员重置密码后才能登录。"
	);
	return { kind: "switched", source };
}
