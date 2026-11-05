import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { createContext } from "./context";
import { runWithRequestOrigin } from "./lib/request-origin";

vi.mock("@automationstack/env/server", () => ({
	env: { SESSION_SECRET: "test-session-secret-0123456789abcdef0123456789" },
}));
vi.mock("@automationstack/db/repositories/users-repository", () => ({
	getUserById: vi.fn(),
}));
vi.mock("./auth/settings-store", () => ({
	getEffectiveAuthSettings: vi.fn(),
}));

/** 用 Hono 处理一次请求，返回这次请求的 context.secure。 */
async function secureFor(url: string, origin: string | null): Promise<boolean> {
	let secure: boolean | null = null;
	const app = new Hono();
	app.get("*", async (c) => {
		({ secure } = await createContext({ context: c }));
		return c.body(null);
	});
	await runWithRequestOrigin(origin, () => app.request(url));
	return secure ?? false;
}

describe("createContext：会话 cookie 是否带 Secure", () => {
	it.each([
		["https without a proxy", "https://test.example.com/rpc", null, true],
		["http without a proxy", "http://localhost:3000/rpc", null, false],
		[
			"http behind nginx that terminates TLS",
			"http://test.example.com/rpc",
			"https://test.example.com",
			true,
		],
		[
			"http behind a proxy that uses http",
			"http://test.example.com/rpc",
			"http://test.example.com",
			false,
		],
	])("%s", async (_name, url, origin, expected) => {
		await expect(secureFor(url, origin)).resolves.toBe(expected);
	});
});
