/**
 * `Authorization: Bearer` 头的解析（plan §4.3）。
 *
 * 单独一个文件，而不是并进 `bearer.ts`：`resolveUserFromBearer` 必须 import
 * repository，而 repository 会 import `@automationstack/db` 的 `index.ts`，
 * 那一行在模块求值期就要 `createEnv()`，没有 `DATABASE_URL` 直接抛。
 * vitest 的 `api` project 不带任何环境变量（根级 `vitest.config.ts`），
 * 于是「测试文件 import 了被测模块」这一步本身就会炸。
 * 把纯解析留在这里，测试只 import 这一个文件，链路上就只剩
 * `@automationstack/db/api-token` —— 那也是个刻意不连库的纯函数模块。
 */

import { API_TOKEN_PREFIX } from "@automationstack/db/api-token";

/**
 * scheme 大小写不敏感（RFC 7235 明文规定 scheme 是 case-insensitive）：
 * 三种 SDK 里总会有一个写 `bearer`，而那时的表现是 401 而不是报错，
 * 排查成本远高于这里多一个 `i`。`[ \t]+` 允许 scheme 与 token 之间有多个空格。
 */
const BEARER_SCHEME_PATTERN = /^bearer[ \t]+/i;

/**
 * token 主体的形状：base64url 字母表，长度给一个区间而不是钉死 43。
 *
 * 钉死当前长度等于把这个包和 `api-token.ts` 里的 `TOKEN_RANDOM_BYTES` 隐式
 * 绑在一起，中间没有任何共享常量；那个值哪天变了，所有 token（老的和新的）
 * 都会在这里被判成畸形，而畸形走的是 `return null` —— 表现是全体 401，
 * 没有任何一处会报错。区间足够挡住真正想挡的东西：`Basic` 的 base64、
 * JWT（带 `.`）、以及随手粘错的一串字符。
 */
const TOKEN_BODY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * 从 `Authorization` 头里取出 token 明文，取不到就是 null。
 *
 * **永不抛异常**：这个函数吃的是任意公网输入，任何一条抛出去的路径都会变成
 * 500——既把解析失败误报成服务端故障，也顺带把栈信息送给了调用方。
 * 「形状不对」和「没带头」在这里是同一件事：都还没到能查库的程度。
 *
 * 先做形状校验再查库，是为了让一个随便乱填 Authorization 的爬虫打不动数据库：
 * 形状不对的输入连一次 SHA-256 都不值得。
 */
export function parseBearerToken(
	header: string | null | undefined
): string | null {
	if (!header) {
		return null;
	}
	// 尾随换行是复制粘贴的常态（`cat token.txt` 出来就带一个），
	// 因此两端一律 trim 后再校验，而不是在校验里给空白开口子。
	const trimmed = header.trim();
	const scheme = BEARER_SCHEME_PATTERN.exec(trimmed);
	if (scheme === null) {
		return null;
	}
	const candidate = trimmed.slice(scheme[0].length).trim();
	if (!candidate.startsWith(API_TOKEN_PREFIX)) {
		return null;
	}
	if (!TOKEN_BODY_PATTERN.test(candidate.slice(API_TOKEN_PREFIX.length))) {
		return null;
	}
	return candidate;
}
