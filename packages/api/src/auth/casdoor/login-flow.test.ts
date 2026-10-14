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

/** 先走一遍 startCasdoorLogin，再用它的 state cookie 回调。 */
async function callback(
	flowDeps: LoginFlowDeps,
	ctx = context(),
	query = (state: string): Record<string, string> => ({ code: "c", state })
) {
	const started = await startCasdoorLogin(context(), "/projects", deps());
	const state = new URL(started.location).searchParams.get("state") ?? "";
	const result = await completeCasdoorLogin(
		ctx,
		{
			cookieHeader: cookieValue(started.cookies[0] ?? ""),
			query: new URLSearchParams(query(state)),
		},
		flowDeps
	);
	return { result, state };
}

const hasSession = (cookies: string[]) =>
	cookies.some((value) => value.startsWith(`${SESSION_COOKIE}=`));

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

	it.each([
		["不是 casdoor 模式", { provider: "local" }, "not-enabled"],
		["连接参数不完整", { internalUrl: null }, "not-configured"],
	] as const)("%s：跳转到登录页，错误码 %s", async (_name, changes, code) => {
		const result = await startCasdoorLogin(
			context({ settings: { ...settings, ...changes } }),
			null,
			deps()
		);
		expect(result.errorCode).toBe(code);
		expect(result.location).toBe(`${FRONTEND}/login?authError=${code}`);
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
		const flowDeps = deps(validClaims);
		const { result, state } = await callback(flowDeps);
		expect(result.errorCode).toBeNull();
		expect(result.location).toBe(`${FRONTEND}/projects`);
		expect(hasSession(result.cookies)).toBe(true);
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
		const flowDeps = deps(validClaims);
		const { result } = await callback(flowDeps, context(), () => ({
			code: "c",
			state: "other",
		}));
		expect(result.errorCode).toBe("state-invalid");
		expect(flowDeps.grant).not.toHaveBeenCalled();
	});

	it("登录期间连接参数变化：settings-changed", async () => {
		const changed = context({
			settings: {
				...settings,
				clientSecret: { present: true, value: "rotated-secret" },
			},
		});
		const { result } = await callback(deps(validClaims), changed);
		expect(result.errorCode).toBe("settings-changed");
	});

	it("Casdoor 返回 error 参数：access-denied", async () => {
		const { result } = await callback(deps(), context(), (state) => ({
			error: "access_denied",
			state,
		}));
		expect(result.errorCode).toBe("access-denied");
	});

	it("换取 token 失败：token-failed，日志中没有 secret", async () => {
		const warn = vi.fn();
		const failing: LoginFlowDeps = {
			...deps(),
			grant: vi.fn(() =>
				Promise.reject(new Error(`invalid client ${SECRET}`))
			) as never,
		};
		const { result } = await callback(failing, context({ warn }));
		expect(result.errorCode).toBe("token-failed");
		expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET);
	});

	it("ID token 的组织不同：identity-rejected，不写用户", async () => {
		const { result } = await callback(
			deps({ ...validClaims, owner: "built-in" })
		);
		expect(result.errorCode).toBe("identity-rejected");
		expect(mocks.upsert).not.toHaveBeenCalled();
	});

	it.each([
		["disabled", "account-disabled"],
		["username-conflict", "username-conflict"],
	] as const)("本地账号 %s：错误码 %s，不签发会话", async (kind, code) => {
		mocks.upsert.mockResolvedValueOnce({ kind });
		const { result } = await callback(deps(validClaims));
		expect(result.errorCode).toBe(code);
		expect(hasSession(result.cookies)).toBe(false);
	});
});
