/**
 * 用例列表两处 LIKE 筛选的模式构造（关键词子串、sourceRef 前缀）。
 *
 * 单独成文件是为了能测：这两条模式一旦漏转义，用户输入里的 `%` / `_`
 * 就从「字面字符」变成通配符——`gen:PRD_v2#` 会连 `gen:PRDxv2#` 一起匹上。
 * 这类错误**既不抛异常也不让 tsc 变红**，只会让筛选结果悄悄多几行，
 * 与 `users-with-projects-core.ts` 拆出来的理由是同一条。
 *
 * 本文件不 import `../index`（那才是真正连库的地方），因此配套测试不需要
 * `DATABASE_URL`。
 */

/**
 * LIKE/ILIKE 里有特殊含义的三个字符：`%`（任意串）、`_`（任意单字符）、
 * 以及转义符 `\` 自身。顶层定义而不是在函数里现 new，是本仓的 lint 要求。
 */
const LIKE_SPECIAL_CHARS = /[%_\\]/g;

/** 把用户输入里的 LIKE 元字符转义成字面量（转义符沿用 Postgres 默认的 `\`）。 */
export function escapeLikePattern(value: string): string {
	return value.replace(LIKE_SPECIAL_CHARS, "\\$&");
}

/** 关键词 → 子串匹配模式（两端加 `%`）。 */
export function containsPattern(keyword: string): string {
	return `%${escapeLikePattern(keyword)}%`;
}

/**
 * sourceRef 前缀 → 前缀匹配模式（**只在右端加 `%`**）。
 *
 * 左端不加 `%` 是这个参数的全部意义：生成场景的 sourceRef 形如
 * `gen:<需求标识>#<用例名 slug>`，要回答的问题是「上一轮给这个需求生成了什么」，
 * 左端一旦放开就会把别的需求的用例也捞进来。
 */
export function prefixPattern(prefix: string): string {
	return `${escapeLikePattern(prefix)}%`;
}
