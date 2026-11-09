import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
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
// HTTP 请求头名称：字母、数字和连字符。
const HEADER_NAME = /^[A-Za-z0-9-]+$/;
// nginx location 的路径前缀：以 / 开始并以 / 结束。
const ACCEL_PREFIX = /^\/[A-Za-z0-9_\-/]*\/$/;

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
		AUTO_SUBMIT_SCAN_CRON: z.string().min(1).default("0 3 * * *"),
		AUTO_SUBMIT_SCAN_TZ: z
			.string()
			.min(1)
			.refine(
				isValidTimeZone,
				"AUTO_SUBMIT_SCAN_TZ 必须是 IANA 时区名，如 Asia/Shanghai"
			)
			.default("Asia/Shanghai"),
		// 反向代理写入客户端 IP 的请求头，例如 x-real-ip。为空时，使用 TCP 连接的地址。
		// 只在 server 只能经过这个代理访问时设置：否则客户端可以伪造这个请求头。
		CLIENT_IP_HEADER: z
			.string()
			.regex(HEADER_NAME, "CLIENT_IP_HEADER 必须是请求头名称，例如 x-real-ip")
			.optional(),
		CORS_ORIGIN: z.url(),
		DATABASE_POOL_MAX: z.coerce
			.number()
			.int()
			.positive()
			.default(DEFAULT_DATABASE_POOL_MAX),
		DATABASE_URL: z.string().min(1),
		// nginx 内部 location 的路径前缀，例如 /_files/。设置时，server 只检查本地文件的下载签名，
		// 然后用 X-Accel-Redirect 让 nginx 发送文件。为空时，server 自己发送文件。
		FILE_STORAGE_ACCEL_PREFIX: z
			.string()
			.regex(
				ACCEL_PREFIX,
				"FILE_STORAGE_ACCEL_PREFIX 必须以 / 开始并以 / 结束，例如 /_files/"
			)
			.optional(),
		// 本地文件存储的目录。存储方式是「服务器本地」时，上传的图片和附件写在这里。
		// 为空时，使用 server 工作目录下的 .data/files。
		FILE_STORAGE_DIR: z.string().min(1).optional(),
		// 用例图片的公开基础地址，例如 https://img.trendf.top（#63，ADR-0003）。
		// 设置时，R2 中的用例图片使用 <基础地址>/<对象键> 的公开链接，否则使用 R2 签名链接。
		// 存储设置页面保存过配置后，使用页面中的值。
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
