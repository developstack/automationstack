/**
 * 钉住 token 的**格式契约**。
 *
 * 这不是「测一遍 crypto 有没有 bug」，而是因为这套格式有两个远端消费者：
 * 已经发出去的 token 存在别人的 CI 配置里，而库里那一列存的是哈希——
 * 生成规则或哈希口径任何一点漂移（少了前缀、换了字母表、大写十六进制），
 * 表现都是**存量 token 集体静默失效**，没有任何一处会报错。
 */
import { describe, expect, it } from "vitest";

import {
	API_TOKEN_DISPLAY_PREFIX_LENGTH,
	API_TOKEN_LAST_USED_THROTTLE_SECONDS,
	API_TOKEN_PREFIX,
	extractApiTokenPrefix,
	generateApiToken,
	hashApiToken,
} from "./api-token";

/** `as_` + base64url(32 字节)，后者无 padding 时正好 43 个字符。 */
const EXPECTED_PLAINTEXT_LENGTH = 46;
const HEX_64 = /^[0-9a-f]{64}$/;
const BASE64URL_BODY = /^[A-Za-z0-9_-]+$/;

describe("generateApiToken", () => {
	it("明文以 as_ 开头且总长 46", async () => {
		const token = await generateApiToken();
		expect(token.plaintext.startsWith(API_TOKEN_PREFIX)).toBe(true);
		expect(token.plaintext).toHaveLength(EXPECTED_PLAINTEXT_LENGTH);
	});

	it("随机体只含 URL 安全字符，没有 padding", async () => {
		const token = await generateApiToken();
		const body = token.plaintext.slice(API_TOKEN_PREFIX.length);
		expect(body).toMatch(BASE64URL_BODY);
	});

	it("两次生成不相同（否则 token_hash 的唯一约束会当场炸给你看）", async () => {
		const [first, second] = await Promise.all([
			generateApiToken(),
			generateApiToken(),
		]);
		expect(first.plaintext).not.toBe(second.plaintext);
		expect(first.tokenHash).not.toBe(second.tokenHash);
	});

	it("prefix 是明文前 11 个字符", async () => {
		const token = await generateApiToken();
		expect(token.prefix).toBe(
			token.plaintext.slice(0, API_TOKEN_DISPLAY_PREFIX_LENGTH)
		);
		expect(token.prefix).toHaveLength(API_TOKEN_DISPLAY_PREFIX_LENGTH);
	});

	it("prefix 与 extractApiTokenPrefix 的结果一致", async () => {
		const token = await generateApiToken();
		expect(token.prefix).toBe(extractApiTokenPrefix(token.plaintext));
	});

	it("tokenHash 等于对含前缀完整明文的哈希（不是剥掉 as_ 之后的）", async () => {
		const token = await generateApiToken();
		expect(token.tokenHash).toBe(await hashApiToken(token.plaintext));
		expect(token.tokenHash).not.toBe(
			await hashApiToken(token.plaintext.slice(API_TOKEN_PREFIX.length))
		);
	});
});

describe("hashApiToken", () => {
	it("同一明文稳定（否则鉴权那次等值查找永远查不中）", async () => {
		const plaintext = "as_deterministic-sample-value";
		expect(await hashApiToken(plaintext)).toBe(await hashApiToken(plaintext));
	});

	it("不同明文得到不同哈希", async () => {
		expect(await hashApiToken("as_alpha")).not.toBe(
			await hashApiToken("as_beta")
		);
	});

	it("输出是 64 位小写十六进制", async () => {
		const token = await generateApiToken();
		expect(token.tokenHash).toMatch(HEX_64);
		expect(await hashApiToken("as_alpha")).toMatch(HEX_64);
	});

	it("对上游已知向量给出标准 SHA-256（换算法会被这条拦住）", async () => {
		expect(await hashApiToken("abc")).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
		);
	});
});

describe("extractApiTokenPrefix", () => {
	it("短于 11 个字符的输入原样返回，不抛错（校验路径拿到的是用户输入）", () => {
		expect(extractApiTokenPrefix("as_1")).toBe("as_1");
	});
});

describe("API_TOKEN_LAST_USED_THROTTLE_SECONDS", () => {
	it("是正整数秒（它会被拼进 SQL 的 interval 字面量）", () => {
		expect(Number.isInteger(API_TOKEN_LAST_USED_THROTTLE_SECONDS)).toBe(true);
		expect(API_TOKEN_LAST_USED_THROTTLE_SECONDS).toBeGreaterThan(0);
	});
});
