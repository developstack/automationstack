import { describe, expect, it } from "vitest";

import { loginStateCookieHeader, readLoginState } from "./login-state";
import { safeRedirectTarget } from "./redirect-target";

const SECRET = "test-session-secret-0123456789abcdef";
const FRONTEND = "http://localhost:3001";
const ELEVEN_MINUTES = 660_000;

const state = {
	fingerprint: "fp",
	nonce: "n",
	redirect: `${FRONTEND}/`,
	state: "s",
	verifier: "v",
};

async function cookie(now = Date.now()): Promise<string> {
	const header = await loginStateCookieHeader(state, SECRET, {
		now,
		secure: false,
	});
	return header.slice(0, header.indexOf(";"));
}

describe("login state cookie", () => {
	it("签名正确且没有过期：读回原值", async () => {
		await expect(readLoginState(await cookie(), SECRET)).resolves.toEqual(
			state
		);
	});

	it.each([
		["值被修改", async () => `${(await cookie()).slice(0, -2)}xx`, SECRET],
		["用其他密钥签名", () => cookie(), "another-secret-0123456789abcdef"],
		["超过 10 分钟", () => cookie(Date.now() - ELEVEN_MINUTES), SECRET],
	])("%s：null", async (_name, makeCookie, secret) => {
		await expect(
			readLoginState(await makeCookie(), secret)
		).resolves.toBeNull();
	});

	it("Secure 只在 https 时设置", async () => {
		const header = await loginStateCookieHeader(state, SECRET, {
			secure: true,
		});
		expect(header).toContain("; Secure");
		expect(header).toContain("Path=/api/auth/casdoor;");
	});
});

describe("safeRedirectTarget", () => {
	it("同源的路径和绝对地址：接受", () => {
		expect(safeRedirectTarget("/projects?x=1", FRONTEND)).toBe(
			`${FRONTEND}/projects?x=1`
		);
		expect(safeRedirectTarget(`${FRONTEND}/a`, FRONTEND)).toBe(`${FRONTEND}/a`);
	});

	it("其他源、协议相对地址、反斜杠和空值：前端首页", () => {
		for (const value of [
			"https://evil.example.com/",
			"//evil.example.com/",
			"/\\evil.example.com",
			"javascript:alert(1)",
			"",
			null,
		]) {
			expect(safeRedirectTarget(value, FRONTEND)).toBe(`${FRONTEND}/`);
		}
	});
});
