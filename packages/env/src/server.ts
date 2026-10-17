import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import {
	CASDOOR_WEBHOOK_SECRET_MIN_LENGTH,
	DEFAULT_CASDOOR_PROJECT_ADMIN_ROLE,
	parseOriginUrl,
} from "./casdoor-rules";
import { devSecretMessage, findDevSecretsInProduction } from "./dev-secrets";

const DEFAULT_PORT = 3000;

// 单实例部署、与其他应用共用宿主 Postgres（max_connections=100）。5 条已能覆盖
// 单请求最大扇出（测试报告 7 路并行查询会在池内排队，单条均为毫秒级），且 pg-boss 共用此池。
const DEFAULT_DATABASE_POOL_MAX = 5;

const SESSION_SECRET_MIN_LENGTH = 32;

// 与 packages/db/src/password.ts 和 users 路由的账号规则一致。
const ADMIN_PASSWORD_MIN_LENGTH = 8;
const ADMIN_PASSWORD_MAX_LENGTH = 128;
const ADMIN_USERNAME_MIN_LENGTH = 2;
const ADMIN_USERNAME_MAX_LENGTH = 32;
const NO_WHITESPACE = /^\S+$/;

const SECRET_ENCRYPTION_KEY_BYTES = 32;

const originUrlSchema = (name: string) =>
	z
		.string()
		.refine(
			(value) => parseOriginUrl(value) !== null,
			`${name} 只能包含协议、主机和端口，例如 https://casdoor.example.com`
		)
		.transform((value) => parseOriginUrl(value) ?? value);

function isValidSecretEncryptionKey(value: string): boolean {
	try {
		return atob(value).length === SECRET_ENCRYPTION_KEY_BYTES;
	} catch {
		return false;
	}
}

function isValidTimeZone(value: string): boolean {
	try {
		Intl.DateTimeFormat(undefined, { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

export const env = createEnv({
	// 生产环境拒绝仓库公开的开发密钥（见 dev-secrets.ts）。
	// 这里拿到的是解析后的值，NODE_ENV 已经套用默认值。
	createFinalSchema: (shape) =>
		z.object(shape).superRefine((values, ctx) => {
			for (const variable of findDevSecretsInProduction(values)) {
				ctx.addIssue({
					code: "custom",
					message: devSecretMessage(variable),
					path: [variable],
				});
			}
		}),
	emptyStringAsUndefined: true,
	runtimeEnv: process.env,
	server: {
		ADMIN_INITIAL_PASSWORD: z
			.string()
			.min(ADMIN_PASSWORD_MIN_LENGTH)
			.max(ADMIN_PASSWORD_MAX_LENGTH)
			.optional(),
		ADMIN_USERNAME: z
			.string()
			.min(ADMIN_USERNAME_MIN_LENGTH)
			.max(ADMIN_USERNAME_MAX_LENGTH)
			.regex(NO_WHITESPACE, "ADMIN_USERNAME 不能包含空白字符")
			.default("admin"),
		AUTH_ALLOW_LOCAL_LOGIN: z.stringbool().default(true),
		AUTH_PROVIDER: z.enum(["local", "casdoor"]).default("local"),
		AUTO_SUBMIT_SCAN_CRON: z.string().min(1).default("0 3 * * *"),
		AUTO_SUBMIT_SCAN_TZ: z
			.string()
			.min(1)
			.refine(
				isValidTimeZone,
				"AUTO_SUBMIT_SCAN_TZ 必须是 IANA 时区名，如 Asia/Shanghai"
			)
			.default("Asia/Shanghai"),
		// Casdoor 参数只是默认值。页面中保存过认证设置后，这些值不再生效（plan 021 §10.2）。
		CASDOOR_ADMIN_ROLE: z.string().min(1).optional(),
		CASDOOR_CLIENT_ID: z.string().min(1).optional(),
		CASDOOR_CLIENT_SECRET: z.string().min(1).optional(),
		// 集群内地址只能在环境变量中设置，页面只读显示。
		CASDOOR_INTERNAL_URL: originUrlSchema("CASDOOR_INTERNAL_URL").optional(),
		CASDOOR_ISSUER: originUrlSchema("CASDOOR_ISSUER").optional(),
		CASDOOR_ORGANIZATION: z.string().min(1).optional(),
		// 项目管理员角色名（#15）。与 CASDOOR_ADMIN_ROLE 的规则相同，只是有默认值。
		CASDOOR_PROJECT_ADMIN_ROLE: z
			.string()
			.min(1)
			.default(DEFAULT_CASDOOR_PROJECT_ADMIN_ROLE),
		// Casdoor 定期对账的 cron 表达式（plan 021 T11a）。只在 casdoor 模式下执行。
		CASDOOR_RECONCILE_CRON: z.string().min(1).default("*/10 * * * *"),
		CASDOOR_REDIRECT_URL: z.url().optional(),
		CASDOOR_WEBHOOK_SECRET: z
			.string()
			.min(CASDOOR_WEBHOOK_SECRET_MIN_LENGTH)
			.optional(),
		CORS_ORIGIN: z.url(),
		DATABASE_POOL_MAX: z.coerce
			.number()
			.int()
			.positive()
			.default(DEFAULT_DATABASE_POOL_MAX),
		DATABASE_URL: z.string().min(1),
		// 用例图片的公开基础地址，例如 https://img.trendf.top（#63，ADR-0003）。
		// 设置时，用例图片使用 <基础地址>/<对象键> 的公开链接，否则使用 R2 签名链接。
		IMAGE_PUBLIC_BASE_URL: z.url().optional(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
		R2_ACCESS_KEY_ID: z.string().min(1).optional(),
		R2_ACCOUNT_ID: z.string().min(1).optional(),
		R2_BUCKET: z.string().min(1).optional(),
		R2_ENDPOINT: z.url().optional(),
		R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
		SECRET_ENCRYPTION_KEY: z
			.string()
			.refine(
				isValidSecretEncryptionKey,
				`SECRET_ENCRYPTION_KEY 必须是 base64 编码的 ${SECRET_ENCRYPTION_KEY_BYTES} 字节密钥（openssl rand -base64 ${SECRET_ENCRYPTION_KEY_BYTES}）`
			)
			.optional(),
		SESSION_SECRET: z.string().min(SESSION_SECRET_MIN_LENGTH),
	},
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});

export function isR2Configured(): boolean {
	return Boolean(
		env.R2_ACCESS_KEY_ID &&
			env.R2_SECRET_ACCESS_KEY &&
			env.R2_BUCKET &&
			(env.R2_ENDPOINT || env.R2_ACCOUNT_ID)
	);
}
