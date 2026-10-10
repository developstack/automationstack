import type { User } from "@automationstack/db/schema/users";
import { Configuration } from "openid-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE } from "../session";
import { effectiveSettings } from "../settings-fixtures";
import { connectionFingerprint } from "./connection";
import {
	completeCasdoorLogin,
	type LoginFlowContext,
	type LoginFlowDeps,
	startCasdoorLogin,
} from "./login-flow";
import { CASDOOR_LOGIN_COOKIE } from "./login-state";

const mocks = vi.hoisted(() => ({ upsert: vi.fn() }));

vi.mock("./login-user", () => ({ upsertCasdoorLoginUser: mocks.upsert }));

const SECRET = "client-secret-value-0001";
const SESSION_SECRET = "test-session-secret-0123456789abcdef";
const FRONTEND = "http://localhost:3001";
const ISSUER = "https://casdoor.example.com";
const REDIRECT_URL = "https://testcase.example.com/api/auth/casdoor/callback";

const settings = effectiveSettings({
	adminRole: "automationstack-admin",
	clientId: "client-id",
	clientSecret: { present: true, value: SECRET },
	internalUrl: "http://casdoor.internal:8000",
	issuer: ISSUER,
	organization: "automationstack",
	provider: "casdoor",
	redirectUrl: REDIRECT_URL,
});

const config = new Configuration(
	{ authorization_endpoint: `${ISSUER}/login/oauth/authorize`, issuer: ISSUER },
	"client-id"
);

const user = { id: "33333333-3333-4333-8333-333333333333" } as User;

let fingerprint = "";

function context(overrides: Partial<LoginFlowContext> = {}): LoginFlowContext {
	return {
		frontendOrigin: FRONTEND,
		secure: false,
		sessionSecret: SESSION_SECRET,
		settings,
		warn: vi.fn(),
		...overrides,
	};
}

function deps(claims: Record<string, unknown> = {}): LoginFlowDeps {
	return {
		getClient: vi.fn(() => Promise.resolve({ config, fingerprint })),
		grant: vi.fn(() => Promise.resolve({ claims: () => claims })) as never,
	};
}

function cookieValue(setCookie: string): string {
	return setCookie.slice(0, setCookie.indexOf(";"));
}

async function begin() {
	const started = await startCasdoorLogin(context(), "/projects", deps());
	const location = new URL(started.location);
	return {
		cookie: cookieValue(started.cookies[0] ?? ""),
		state: location.searchParams.get("state") ?? "",
	};
}

const validClaims = {
	name: "alice",
	owner: "automationstack",
	roles: [],
	sub: "4e1fe32c-0000-4000-8000-000000000001",
};

beforeEach(async () => {
	fingerprint = await connectionFingerprint({
		clientId: "client-id",
		clientSecret: SECRET,
		internalUrl: "http://casdoor.internal:8000",
		issuer: ISSUER,
		redirectUrl: REDIRECT_URL,
	});
	mocks.upsert.mockReset();
	mocks.upsert.mockResolvedValue({ kind: "ok", user });
});

describe("startCasdoorLogin", () => {
	it("跳转到公网授权地址，带 state、nonce 和 S256 PKCE；state cookie 为 HttpOnly + SameSite=Lax", async () => {
		const result = await startCasdoorLogin(context(), null, deps());
		const location = new URL(result.location);
		expect(location.origin).toBe(ISSUER);
		expect(location.searchParams.get("code_challenge_method")).toBe("S256");
		expect(location.searchParams.get("redirect_uri")).toBe(REDIRECT_URL);
		for (const key of ["state", "nonce", "code_challenge"]) {
			expect(location.searchParams.get(key)).toBeTruthy();
		}
		expect(result.cookies[0]).toContain(`${CASDOOR_LOGIN_COOKIE}=`);
		expect(result.cookies[0]).toContain("HttpOnly; SameSite=Lax");
	});

	it("不是 casdoor 模式：跳转到登录页，错误码 not-enabled", async () => {
		const result = await startCasdoorLogin(
			context({ settings: { ...settings, provider: "local" } }),
			null,
			deps()
		);
		expect(result.location).toBe(`${FRONTEND}/login?authError=not-enabled`);
	});

	it("连接参数不完整：not-configured", async () => {
		const result = await startCasdoorLogin(
			context({ settings: { ...settings, internalUrl: null } }),
			null,
			deps()
		);
		expect(result.errorCode).toBe("not-configured");
	});

	it("读取发现文档失败：unavailable，日志中没有 secret", async () => {
		const warn = vi.fn();
		const failing: LoginFlowDeps = {
			...deps(),
			getClient: vi.fn(() => Promise.reject(new Error(`bad ${SECRET}`))),
		};
		const result = await startCasdoorLogin(context({ warn }), null, failing);
		expect(result.errorCode).toBe("unavailable");
		expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET);
	});
});

describe("completeCasdoorLogin", () => {
	it("成功：签发会话 cookie，清除 state cookie，跳转到登录前的同源地址", async () => {
		const { cookie, state } = await begin();
		const flowDeps = deps(validClaims);
		const result = await completeCasdoorLogin(
			context(),
			{
				cookieHeader: cookie,
				query: new URLSearchParams({ code: "c", state }),
			},
			flowDeps
		);
		expect(result.errorCode).toBeNull();
		expect(result.location).toBe(`${FRONTEND}/projects`);
		expect(
			result.cookies.some((value) => value.startsWith(`${SESSION_COOKIE}=`))
		).toBe(true);
		expect(result.cookies[0]).toContain("Max-Age=0");
		const [, currentUrl, checks] =
			vi.mocked(flowDeps.grant).mock.calls[0] ?? [];
		expect(String(currentUrl)).toBe(`${REDIRECT_URL}?code=c&state=${state}`);
		expect(checks).toMatchObject({
			expectedState: state,
			idTokenExpected: true,
		});
	});

	it("没有 state cookie：state-invalid", async () => {
		const result = await completeCasdoorLogin(
			context(),
			{
				cookieHeader: null,
				query: new URLSearchParams({ code: "c", state: "x" }),
			},
			deps(validClaims)
		);
		expect(result.errorCode).toBe("state-invalid");
	});

	it("查询中的 state 与 cookie 不同：state-invalid，不换取 token", async () => {
		const { cookie } = await begin();
		const flowDeps = deps(validClaims);
		const result = await completeCasdoorLogin(
			context(),
			{
				cookieHeader: cookie,
				query: new URLSearchParams({ code: "c", state: "other" }),
			},
			flowDeps
		);
		expect(result.errorCode).toBe("state-invalid");
		expect(flowDeps.grant).not.toHaveBeenCalled();
	});

	it("登录期间连接参数变化：settings-changed", async () => {
		const { cookie, state } = await begin();
		const changed = context({
			settings: {
				...settings,
				clientSecret: { present: true, value: "rotated-secret" },
			},
		});
		const result = await completeCasdoorLogin(
			changed,
			{
				cookieHeader: cookie,
				query: new URLSearchParams({ code: "c", state }),
			},
			deps(validClaims)
		);
		expect(result.errorCode).toBe("settings-changed");
	});

	it("Casdoor 返回 error 参数：access-denied", async () => {
		const { cookie, state } = await begin();
		const result = await completeCasdoorLogin(
			context(),
			{
				cookieHeader: cookie,
				query: new URLSearchParams({ error: "access_denied", state }),
			},
			deps()
		);
		expect(result.errorCode).toBe("access-denied");
	});

	it("换取 token 失败：token-failed，日志中没有 secret", async () => {
		const { cookie, state } = await begin();
		const warn = vi.fn();
		const failing: LoginFlowDeps = {
			...deps(),
			grant: vi.fn(() =>
				Promise.reject(new Error(`invalid client ${SECRET}`))
			) as never,
		};
		const result = await completeCasdoorLogin(
			context({ warn }),
			{
				cookieHeader: cookie,
				query: new URLSearchParams({ code: "c", state }),
			},
			failing
		);
		expect(result.errorCode).toBe("token-failed");
		expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET);
	});

	it("ID token 的组织不同：identity-rejected，不写用户", async () => {
		const { cookie, state } = await begin();
		const result = await completeCasdoorLogin(
			context(),
			{
				cookieHeader: cookie,
				query: new URLSearchParams({ code: "c", state }),
			},
			deps({ ...validClaims, owner: "built-in" })
		);
		expect(result.errorCode).toBe("identity-rejected");
		expect(mocks.upsert).not.toHaveBeenCalled();
	});

	it("本地账号已停用或用户名冲突：对应的错误码，不签发会话", async () => {
		for (const [kind, code] of [
			["disabled", "account-disabled"],
			["username-conflict", "username-conflict"],
		] as const) {
			// biome-ignore lint/performance/noAwaitInLoops: 两种情况依次检查
			const { cookie, state } = await begin();
			mocks.upsert.mockResolvedValueOnce({ kind });
			const result = await completeCasdoorLogin(
				context(),
				{
					cookieHeader: cookie,
					query: new URLSearchParams({ code: "c", state }),
				},
				deps(validClaims)
			);
			expect(result.errorCode).toBe(code);
			expect(
				result.cookies.some((value) => value.startsWith(`${SESSION_COOKIE}=`))
			).toBe(false);
		}
	});
});
