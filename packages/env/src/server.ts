import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const DEFAULT_PORT = 3000;

// 单实例部署、与其他应用共用宿主 Postgres（max_connections=100）。5 条已能覆盖
// 单请求最大扇出（测试报告 7 路并行查询会在池内排队，单条均为毫秒级），且 pg-boss 共用此池。
const DEFAULT_DATABASE_POOL_MAX = 5;

const SESSION_SECRET_MIN_LENGTH = 32;

const SECRET_ENCRYPTION_KEY_BYTES = 32;

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
	emptyStringAsUndefined: true,
	runtimeEnv: process.env,
	server: {
		AUTO_SUBMIT_SCAN_CRON: z.string().min(1).default("0 3 * * *"),
		AUTO_SUBMIT_SCAN_TZ: z
			.string()
			.min(1)
			.refine(
				isValidTimeZone,
				"AUTO_SUBMIT_SCAN_TZ 必须是 IANA 时区名，如 Asia/Shanghai"
			)
			.default("Asia/Shanghai"),
		CORS_ORIGIN: z.url(),
		DATABASE_POOL_MAX: z.coerce
			.number()
			.int()
			.positive()
			.default(DEFAULT_DATABASE_POOL_MAX),
		DATABASE_URL: z.string().min(1),
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
