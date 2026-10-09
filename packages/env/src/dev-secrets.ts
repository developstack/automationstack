/**
 * 仓库里公开过的开发默认密钥。生产环境拒绝这些值，服务不启动。
 *
 * 来源（修改这些文件里的默认值时，同步修改这里）：
 * - apps/server/.env.example：SESSION_SECRET、SECRET_ENCRYPTION_KEY、ADMIN_INITIAL_PASSWORD，
 *   以及 DATABASE_URL 中的数据库密码。
 * - 根目录 .env.example：POSTGRES_PASSWORD。docker-compose.yml 把它拼进 server 的 DATABASE_URL。
 *
 * 所有变量共用这一张表：开发值被抄到另一个变量里，同样是公开值。
 * dev-secrets.test.ts 检查 .env.example 中的每个密钥都在这张表里。
 */
export const KNOWN_DEV_SECRETS: readonly string[] = [
	"dev-only-session-secret-change-me-0123456789abcdef",
	"U0t6cb4rxrzmt9qa9Po0Txv+IoE5wZ/3ZBYkt7TBbxo=",
	"dev-only-admin-password",
	"automationstack-dev",
];

/** 生产环境检查的变量。DATABASE_URL 只检查其中的密码。 */
export const DEV_SECRET_VARIABLES = [
	"ADMIN_INITIAL_PASSWORD",
	"DATABASE_URL",
	"SECRET_ENCRYPTION_KEY",
	"SESSION_SECRET",
] as const;

export type DevSecretVariable = (typeof DEV_SECRET_VARIABLES)[number];

export type DevSecretCheckInput = Partial<
	Record<DevSecretVariable | "NODE_ENV", string | undefined>
>;

const KNOWN_DEV_SECRETS_NORMALIZED = new Set(
	KNOWN_DEV_SECRETS.map((secret) => secret.trim().toLowerCase())
);

/** 值是否是公开过的开发默认值。去掉首尾空白后比较，不区分大小写。 */
export function isKnownDevSecret(value: string | undefined): boolean {
	if (value === undefined) {
		return false;
	}
	return KNOWN_DEV_SECRETS_NORMALIZED.has(value.trim().toLowerCase());
}

/** 连接串中的密码。不是 URL 形式或没有密码时返回 undefined。 */
export function databaseUrlPassword(
	databaseUrl: string | undefined
): string | undefined {
	if (databaseUrl === undefined || !URL.canParse(databaseUrl)) {
		return undefined;
	}
	const { password } = new URL(databaseUrl);
	if (password === "") {
		return undefined;
	}
	try {
		return decodeURIComponent(password);
	} catch {
		return password;
	}
}

function secretValueOf(
	input: DevSecretCheckInput,
	variable: DevSecretVariable
): string | undefined {
	return variable === "DATABASE_URL"
		? databaseUrlPassword(input.DATABASE_URL)
		: input[variable];
}

/**
 * 生产环境中值等于开发默认值的变量名。非生产环境总是返回空数组。
 * 只返回变量名，不返回值。
 */
export function findDevSecretsInProduction(
	input: DevSecretCheckInput
): DevSecretVariable[] {
	if (input.NODE_ENV !== "production") {
		return [];
	}
	return DEV_SECRET_VARIABLES.filter((variable) =>
		isKnownDevSecret(secretValueOf(input, variable))
	);
}

/** 拒绝启动时的错误信息。只写变量名，不写值：启动日志会进入集中日志系统。 */
export function devSecretMessage(variable: DevSecretVariable): string {
	const subject =
		variable === "DATABASE_URL" ? "DATABASE_URL 中的数据库密码" : variable;
	return `${subject} 是仓库公开的开发默认值。生产环境必须换成自己生成的随机值。`;
}
