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
 * 或多一位都会让整个「数据库里的第三方凭据」功能静默不可用，越早报越好。
 */
function isValidSecretEncryptionKey(value: string): boolean {
	try {
		return atob(value).length === SECRET_ENCRYPTION_KEY_BYTES;
	} catch {
		return false;
	}
}

/**
 * 时区在这里就校验，而不是等 pg-boss 注册调度时才炸：写错时区不会让服务起不来，
 * 只会让 `boss.schedule()` 抛在 `startJobs()` 的 catch 里被吞掉——后果是每日
 * 自动提交扫描**从此永远不跑**，而接口全绿、看不出任何异常（读路径惰性结算还在，
 * 连数据都不会明显不对，只是「零访问」的盲区悄悄回来了）。
 *
 * 用 `Intl.DateTimeFormat` 试解而不是 `Intl.supportedValuesOf`：后者只给规范名，
 * 会误杀 `US/Pacific` 这类合法别名，而 pg-boss 那边是认的。
 */
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
		/**
		 * 测试报告每日自动提交扫描的 cron 表达式（plan 011 D5）。时刻本身无
		 * 业务含义，仅钻夜间低谷；条件是累积式的，停机错过一天次日自然补上。
		 */
		AUTO_SUBMIT_SCAN_CRON: z.string().min(1).default("0 3 * * *"),
		/**
		 * 上一项 cron 的时区，需为 IANA 时区名（pg-boss 要求），如
		 * `Asia/Shanghai`；不能用 `UTC+8` 这类缩写写法——所以这里当场校验。
		 *
		 * cron 表达式本身没在这里校验（env 包不该为了认一行 cron 把解析器拖进
		 * 依赖图）：它由 pg-boss 在注册时解析，**认不出来**的写法会让后台任务启动
		 * 失败，表现为 `GET /health` 的 `jobs` 变成 `"failed"`。
		 *
		 * 注意这兜不住「少写一个字段」：pg-boss 用的是非严格模式，`0 3 * *` 能解析
		 * 通过、只是排出来的时刻和你想的不是一回事。改完对着 `pgboss.schedule` 表
		 * 看一眼实际落库的 cron 最稳。
		 */
		AUTO_SUBMIT_SCAN_TZ: z
			.string()
			.min(1)
			.refine(
				isValidTimeZone,
				"AUTO_SUBMIT_SCAN_TZ 必须是 IANA 时区名，如 Asia/Shanghai"
			)
			.default("Asia/Shanghai"),
		CORS_ORIGIN: z.url(),
		DATABASE_URL: z.string().min(1),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		/** 可选：HTTP/WS 监听端口，便于本地并行起多个实例。 */
		PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
		/**
		 * Cloudflare R2 附件存储（plan §6）。**五个变量全部 optional**，
		 * 判定见本文件末尾的 `isR2Configured()`。
		 *
		 * 为什么不做成「要么全配、要么全不配」的 superRefine：那会让「配错一个」
		 * 变成整个服务起不来，而附件只是测试任务的一个可选侧翼能力。缺项一律折算成
		 * 「未配置」，与 Jira 未配置时 `getJiraClient()` 返回 null 是同一种降级
		 * 姿势（plan §5.1 / D9）——上传入口禁用，测试任务主流程一行不受影响。
		 */
		R2_ACCESS_KEY_ID: z.string().min(1).optional(),
		/** R2 账号 ID；未显式给 `R2_ENDPOINT` 时用它拼出默认 endpoint。 */
		R2_ACCOUNT_ID: z.string().min(1).optional(),
		/**
		 * 存桶名。**这个桶必须保持私有**：测试截图常含测试环境的真实业务数据，
		 * 读取一律走 15 分钟短期签名 GET（plan §6 / D10），不开 public access。
		 */
		R2_BUCKET: z.string().min(1).optional(),
		/**
		 * 可选的 endpoint 覆盖。留空时用
		 * `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`。
		 * 存在的意义是本地/CI 能指向 MinIO 之类的 S3 兼容实现做联调，
		 * 不必为了跑一次上传去开真桶。
		 */
		R2_ENDPOINT: z.url().optional(),
		R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
		/**
		 * 数据库里那些第三方凭据（当前是 `jira_configs.api_token_cipher`）的主
		 * 密钥：base64 编码的 32 字节，用 `openssl rand -base64 32` 生成。
		 *
		 * ⚠️ 换掉它会让所有已存的凭据全部解不开（AES-GCM 认证标签对不上），
		 * 表现为项目 owner 必须重新填一次 Jira API Token；旧密文没有任何办法找回。
		 *
		 * 设成 optional：没配主密钥时「把凭据存进数据库」这条路整体不可用，
		 * Jira 集成配不起来，但服务照常启动。
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

/**
 * R2 是否可用。**任何附件写路径都必须先过这一关**，未配置时 router 返回
 * 明确的「未配置」而不是让 SDK 在没有 credentials 的情况下抛出 500。
 *
 * `R2_ACCOUNT_ID` 与 `R2_ENDPOINT` 是二选一而不是都必需：endpoint 能从
 * account id 拼出来，反过来指向 MinIO 时压根没有 account id 这个概念。
 * 只要 endpoint 有了，account id 就是多余信息。
 *
 * 放在 env 包而不是 R2 客户端里：判定只依赖环境变量，前端 / router / 服务启动
 * 日志都可能要问这一句，而它们不该为了问一句话把 aws-sdk 拖进依赖图。
 */
export function isR2Configured(): boolean {
	return Boolean(
		env.R2_ACCESS_KEY_ID &&
			env.R2_SECRET_ACCESS_KEY &&
			env.R2_BUCKET &&
			(env.R2_ENDPOINT || env.R2_ACCOUNT_ID)
	);
}
