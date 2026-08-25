/**
 * 个人 API Token 的明文生成与哈希（plan §4.2）。
 *
 * 纯函数模块，刻意不 import `../index` 也不 import 任何 schema 值——只有这样
 * 它才进得了 vitest 的 `db` project（那边不连库、没有 DATABASE_URL，
 * 见根级 `vitest.config.ts` 里那条注释）。
 *
 * ## 为什么是 SHA-256，而不是 `password.ts` 的 PBKDF2
 *
 * 1. **必须能按哈希做索引查找**。鉴权是 `WHERE token_hash = ? AND
 *    revoked_at IS NULL` 一次索引命中；PBKDF2 每行盐不同，只能把全表拉回来
 *    逐行重新派生着验，token 一多就废。
 * 2. **慢哈希在这里没有意义**。PBKDF2 是为低熵的用户口令准备的，防的是离线
 *    字典爆破；token 是 32 字节 CSPRNG 随机串，爆破空间大到无所谓，
 *    SHA-256 足够。
 *
 * ## 为什么也不是 `secret-box.ts` 的可逆加密
 *
 * `jira_configs.apiTokenCipher` 要拿去调 Jira，所以必须可逆；本期的 token
 * 平台**只需要校验、永远不需要还原**，存可逆密文纯属给自己留一个可以被
 * 脱库解密的洞。
 *
 * 明文只在创建那一刻返回一次（见 `repositories/api-tokens-repository.ts`），
 * 此后库里和列表页都只剩 `prefix` + 用户自己起的备注名。
 */

/** 明文的固定前缀，用于在日志 / 支持工单里一眼认出「这是本平台的 token」。 */
export const API_TOKEN_PREFIX = "as_";

/**
 * 列表页展示的前缀长度：`as_` + 8 个随机字符。
 * 8 个 base64url 字符 ≈ 48 bit，足以让一个人区分自己的几枚 token，
 * 又远不足以拿去猜剩下的 35 个字符。
 */
export const API_TOKEN_DISPLAY_PREFIX_LENGTH = 11;

/**
 * `lastUsedAt` 的写入节流窗口（秒）。这一列回答的是「这枚 token 还在不在用 /
 * 泄露了最后一次被用是什么时候」，精确到分钟绰绰有余；每次上报都 UPDATE 一行，
 * 只是在最热的路径上白加一次写。节流的落点见 repository 里的 SQL 谓词。
 */
export const API_TOKEN_LAST_USED_THROTTLE_SECONDS = 60;

/** 32 字节 CSPRNG：base64url 后是 43 个字符，加前缀总长 46。 */
const TOKEN_RANDOM_BYTES = 32;

const HEX_RADIX = 16;
const HEX_DIGITS_PER_BYTE = 2;

const encoder = new TextEncoder();

/**
 * base64url 且去掉 padding：token 会出现在 `Authorization` 头、命令行、
 * 以及各家 SDK 的配置文件里，`+` / `/` / `=` 在这些地方都有被转义或截断的
 * 前科，换成 URL 安全字母表就没有这类惊喜。
 */
function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

/** 小写十六进制：这一列要进 SQL 等值比较，大小写混用会让唯一约束形同虚设。 */
function toHex(bytes: Uint8Array): string {
	let hex = "";
	for (const byte of bytes) {
		hex += byte.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, "0");
	}
	return hex;
}

/**
 * 哈希的是**含 `as_` 前缀的完整明文**。
 *
 * 鉴权时从 `Authorization: Bearer as_xxx` 里拿到的就是完整串，中途剥前缀
 * 只会多出一个「两边都得记得剥」的步骤，而一旦有一边忘了，表现是登录静默
 * 失败而不是报错。
 */
export async function hashApiToken(plaintext: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		encoder.encode(plaintext)
	);
	return toHex(new Uint8Array(digest));
}

/** 从明文取列表页展示用的前缀。生成与校验两侧都走这里，避免各切各的。 */
export function extractApiTokenPrefix(plaintext: string): string {
	return plaintext.slice(0, API_TOKEN_DISPLAY_PREFIX_LENGTH);
}

export interface GeneratedApiToken {
	plaintext: string;
	prefix: string;
	tokenHash: string;
}

/** 生成一枚新 token。`plaintext` 是这辈子唯一一次能拿到明文的地方。 */
export async function generateApiToken(): Promise<GeneratedApiToken> {
	const random = crypto.getRandomValues(new Uint8Array(TOKEN_RANDOM_BYTES));
	const plaintext = `${API_TOKEN_PREFIX}${toBase64Url(random)}`;
	return {
		plaintext,
		prefix: extractApiTokenPrefix(plaintext),
		tokenHash: await hashApiToken(plaintext),
	};
}
