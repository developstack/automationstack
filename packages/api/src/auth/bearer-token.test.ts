import { generateApiToken } from "@automationstack/db/api-token";
import { describe, expect, it } from "vitest";

import { parseBearerToken } from "./bearer-token";

/** 一枚形状合法的 token：`as_` + 43 个 base64url 字符，与真实生成物同形。 */
const VALID_TOKEN = "as_9xK3mQ7vLp2ZtR8yBn4WcF6dH1jS5aG0eU-uI_oPzQw";

describe("parseBearerToken", () => {
	it("认标准的 Bearer 头", () => {
		expect(parseBearerToken(`Bearer ${VALID_TOKEN}`)).toBe(VALID_TOKEN);
	});

	it("scheme 小写照样认：RFC 7235 规定 scheme 大小写不敏感", () => {
		expect(parseBearerToken(`bearer ${VALID_TOKEN}`)).toBe(VALID_TOKEN);
	});

	it("scheme 全大写照样认", () => {
		expect(parseBearerToken(`BEARER ${VALID_TOKEN}`)).toBe(VALID_TOKEN);
	});

	it("scheme 与 token 之间多个空格不影响", () => {
		expect(parseBearerToken(`Bearer    ${VALID_TOKEN}`)).toBe(VALID_TOKEN);
	});

	it("尾随换行要被吃掉：从文件里复制 token 时带上它是常态", () => {
		expect(parseBearerToken(`Bearer ${VALID_TOKEN}\n`)).toBe(VALID_TOKEN);
	});

	it("整个头两端的空白不影响", () => {
		expect(parseBearerToken(`  Bearer ${VALID_TOKEN}  `)).toBe(VALID_TOKEN);
	});

	it("没带头时返回 null，而不是抛异常", () => {
		expect(parseBearerToken(null)).toBeNull();
		expect(parseBearerToken(undefined)).toBeNull();
		expect(parseBearerToken("")).toBeNull();
	});

	it("只有空白的头返回 null", () => {
		expect(parseBearerToken("   ")).toBeNull();
	});

	it("别的认证 scheme 一律不认", () => {
		expect(parseBearerToken("Basic dXNlcjpwYXNz")).toBeNull();
	});

	it("scheme 只是前缀相同也不认：Bearerish 不是 Bearer", () => {
		expect(parseBearerToken(`Bearerish ${VALID_TOKEN}`)).toBeNull();
	});

	it("只有 Bearer 没有 token 返回 null", () => {
		expect(parseBearerToken("Bearer")).toBeNull();
		expect(parseBearerToken("Bearer   ")).toBeNull();
	});

	it("不以 as_ 开头的串不认：形状不对就不值得查一次库", () => {
		expect(parseBearerToken("Bearer sk-1234567890abcdefghij")).toBeNull();
	});

	it("字符集越界的串不认", () => {
		expect(
			parseBearerToken("Bearer as_短短短短短短短短短短短短短短短短短")
		).toBeNull();
		expect(
			parseBearerToken(`Bearer ${VALID_TOKEN.replace("9", "$")}`)
		).toBeNull();
	});

	it("token 里夹了空格不认：那多半是把两个值粘一起了", () => {
		expect(parseBearerToken(`Bearer ${VALID_TOKEN} extra`)).toBeNull();
	});

	it("主体太短不认：as_ 后面得真有东西", () => {
		expect(parseBearerToken("Bearer as_")).toBeNull();
		expect(parseBearerToken("Bearer as_abc")).toBeNull();
	});

	it("真正 generateApiToken() 生成的明文能被原样取出", async () => {
		const { plaintext } = await generateApiToken();
		expect(parseBearerToken(`Bearer ${plaintext}`)).toBe(plaintext);
	});
});
