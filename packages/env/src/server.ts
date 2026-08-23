import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/** 默认 HTTP 端口；未设置 PORT 时使用。 */
const DEFAULT_PORT = 3000;

/** 会话签名密钥的最小长度：等于 HMAC-SHA256 的摘要字节数。 */
const SESSION_SECRET_MIN_LENGTH = 32;

/** AES-256 主密钥长度，与 `packages/db/src/secret-box.ts` 的 SECRET_KEY_BYTES 一致。 */
const SECRET_ENCRYPTION_KEY_BYTES = 32;

/**
 * 在这里就把 base64 解开量一下长度，而不是等到第一次加密时才炸：主密钥少一位
 * 或多一位都会让整个「数据库里的 API Key」功能静默不可用，越早报越好。
 */
function isValidSecretEncryptionKey(value: string): boolean {
	try {
		return atob(value).length === SECRET_ENCRYPTION_KEY_BYTES;
	} catch {
		return false;
	}
}

export const env = createEnv({
	emptyStringAsUndefined: true,
	runtimeEnv: process.env,
	server: {
		AI_API_KEY: z.string().min(1).optional(),
		AI_BASE_URL: z.url().optional(),
		AI_MODEL: z.string().min(1).optional(),
		CORS_ORIGIN: z.url(),
		DATABASE_URL: z.string().min(1),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		/** 可选：HTTP/WS 监听端口，便于本地并行起多个实例。 */
		PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
		/**
		 * 数据库里那份 AI provider 配置的 API Key 主密钥：base64 编码的 32 字节，
		 * 用 `openssl rand -base64 32` 生成。
		 *
		 * ⚠️ 换掉它会让所有已存的 API Key 全部解不开（AES-GCM 认证标签对不上），
		 * 表现为管理员必须重新填一次 Key；旧密文没有任何办法找回。
		 *
		 * 设成 optional：没配主密钥时「把配置存进数据库」这条路整体不可用，
		 * 服务干净地回落到 AI_BASE_URL / AI_API_KEY / AI_MODEL 三个环境变量，
		 * 而不是连服务都起不来。
		 */
		SECRET_ENCRYPTION_KEY: z
			.string()
			.refine(
				isValidSecretEncryptionKey,
				`SECRET_ENCRYPTION_KEY 必须是 base64 编码的 ${SECRET_ENCRYPTION_KEY_BYTES} 字节密钥（openssl rand -base64 ${SECRET_ENCRYPTION_KEY_BYTES}）`
			)
			.optional(),
		/**
		 * 会话 cookie 的 HMAC 签名密钥。至少 32 字符——签名用的是
		 * HMAC-SHA256，密钥短于摘要长度（32 字节）就等于白送熵。
		 * 换掉它会让所有已签发的会话立即失效（等同于全员登出）。
		 */
		SESSION_SECRET: z.string().min(SESSION_SECRET_MIN_LENGTH),
	},
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
