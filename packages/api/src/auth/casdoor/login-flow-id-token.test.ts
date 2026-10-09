// 回调流程使用真实的 openid-client（discoverCasdoor + authorizationCodeGrant），
// 只替换网络请求。证明签名错误、被篡改、iss 或 aud 不对的 ID token 都被拒绝（plan 021 T10、§11.10 第 2 项）。
import { generateKeyPairSync, type KeyObject, sign } from "node:crypto";

import type { User } from "@automationstack/db/schema/users";
import { authorizationCodeGrant, type CustomFetch } from "openid-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { effectiveSettings } from "../settings-fixtures";
import { type CasdoorConnection, connectionFingerprint } from "./connection";
import {
	completeCasdoorLogin,
	type LoginFlowContext,
	type LoginFlowDeps,
	startCasdoorLogin,
} from "./login-flow";
import { discoverCasdoor } from "./oidc";

const mocks = vi.hoisted(() => ({ upsert: vi.fn() }));

vi.mock("./login-user", () => ({ upsertCasdoorLoginUser: mocks.upsert }));

const SECRET = "client-secret-value-0001";
const SESSION_SECRET = "test-session-secret-0123456789abcdef";
const FRONTEND = "http://localhost:3001";
const ISSUER = "https://casdoor.example.com";
const INTERNAL = "http://casdoor.internal:8000";
const CLIENT_ID = "client-id";
const KEY_ID = "casdoor-test-key";
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const SIGNATURE_FAILED = /JWT signature verification failed/;
const ISS_REJECTED = /"iss" \(issuer\)/;
const AUD_REJECTED = /"aud" \(audience\)/;
const NONCE_REJECTED = /"nonce"/;

const connection: CasdoorConnection = {
	adminRole: "automationstack-admin",
	clientId: CLIENT_ID,
	clientSecret: SECRET,
	internalUrl: INTERNAL,
	issuer: ISSUER,
	organization: "automationstack",
	redirectUrl: "https://testcase.example.com/api/auth/casdoor/callback",
};

const settings = effectiveSettings({
	...connection,
	clientSecret: { present: true, value: SECRET },
	provider: "casdoor",
});

const user = { id: "33333333-3333-4333-8333-333333333333" } as User;

const casdoorKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const attackerKey = generateKeyPairSync("rsa", { modulusLength: 2048 });

function base64url(value: Buffer | string): string {
	return Buffer.from(value).toString("base64url");
}

function signJwt(
	payload: Record<string, unknown>,
	privateKey: KeyObject
): string {
	const header = base64url(
		JSON.stringify({ alg: "RS256", kid: KEY_ID, typ: "JWT" })
	);
	const body = base64url(JSON.stringify(payload));
	const signature = sign(
		"sha256",
		Buffer.from(`${header}.${body}`),
		privateKey
	);
	return `${header}.${body}.${base64url(signature)}`;
}

/** 保留原签名，只改 payload：模拟被篡改的 ID token。 */
function tamperPayload(token: string, change: Record<string, unknown>): string {
	const [header, body, signature] = token.split(".");
	const payload = JSON.parse(
		Buffer.from(body ?? "", "base64url").toString("utf8")
	) as Record<string, unknown>;
	return `${header}.${base64url(JSON.stringify({ ...payload, ...change }))}.${signature}`;
}

function claimsFor(nonce: string): Record<string, unknown> {
	const now = Math.floor(Date.now() / MS_PER_SECOND);
	return {
		aud: CLIENT_ID,
		exp: now + SECONDS_PER_MINUTE,
		iat: now,
		iss: ISSUER,
		name: "alice",
		nonce,
		owner: "automationstack",
		roles: [],
		sub: "4e1fe32c-0000-4000-8000-000000000001",
	};
}

/** Casdoor 的发现文档、JWKS 和 token 地址。ID token 由测试按 nonce 生成。 */
function fakeCasdoor(idTokenFor: (nonce: string) => string) {
	let nonce = "";
	const jwk = {
		...casdoorKey.publicKey.export({ format: "jwk" }),
		alg: "RS256",
		kid: KEY_ID,
		use: "sig",
	};
	const doFetch = vi.fn<CustomFetch>((url) => {
		const { pathname } = new URL(url);
		if (pathname === "/.well-known/openid-configuration") {
			return Promise.resolve(
				Response.json({
					authorization_endpoint: `${ISSUER}/login/oauth/authorize`,
					id_token_signing_alg_values_supported: ["RS256"],
					issuer: ISSUER,
					jwks_uri: `${ISSUER}/.well-known/jwks`,
					token_endpoint: `${ISSUER}/api/login/oauth/access_token`,
				})
			);
		}
		if (pathname === "/.well-known/jwks") {
			return Promise.resolve(Response.json({ keys: [jwk] }));
		}
		return Promise.resolve(
			Response.json({
				access_token: "access-token",
				expires_in: 3600,
				id_token: idTokenFor(nonce),
				token_type: "Bearer",
			})
		);
	});
	const deps: LoginFlowDeps = {
		getClient: async (target) => ({
			config: await discoverCasdoor(target, { fetch: doFetch }),
			fingerprint: await connectionFingerprint(target),
		}),
		grant: authorizationCodeGrant,
	};
	return {
		deps,
		doFetch,
		setNonce: (value: string) => {
			nonce = value;
		},
	};
}

function context(warn: (message: string) => void): LoginFlowContext {
	return {
		frontendOrigin: FRONTEND,
		secure: false,
		sessionSecret: SESSION_SECRET,
		settings,
		warn,
	};
}

async function runCallback(idTokenFor: (nonce: string) => string) {
	const casdoor = fakeCasdoor(idTokenFor);
	const warn = vi.fn<(message: string) => void>();
	const started = await startCasdoorLogin(
		context(warn),
		"/projects",
		casdoor.deps
	);
	const location = new URL(started.location);
	casdoor.setNonce(location.searchParams.get("nonce") ?? "");
	const cookie = started.cookies[0] ?? "";
	const result = await completeCasdoorLogin(
		context(warn),
		{
			cookieHeader: cookie.slice(0, cookie.indexOf(";")),
			query: new URLSearchParams({
				code: "code-1",
				state: location.searchParams.get("state") ?? "",
			}),
		},
		casdoor.deps
	);
	const warning = warn.mock.calls.map(([message]) => message).join("\n");
	return { doFetch: casdoor.doFetch, result, warning };
}

beforeEach(() => {
	mocks.upsert.mockReset();
	mocks.upsert.mockResolvedValue({ kind: "ok", user });
});

describe("completeCasdoorLogin：ID token 校验（真实 openid-client）", () => {
	it("对照：正确签名、iss、aud 和 nonce 的 ID token 登录成功", async () => {
		const { doFetch, result } = await runCallback((nonce) =>
			signJwt(claimsFor(nonce), casdoorKey.privateKey)
		);
		expect(result.errorCode).toBeNull();
		expect(mocks.upsert).toHaveBeenCalledTimes(1);
		const urls = doFetch.mock.calls.map(([url]) => url);
		expect(urls).toContain(`${INTERNAL}/.well-known/jwks`);
	});

	it("payload 被篡改（签名不变）：token-failed，不写用户", async () => {
		const { result, warning } = await runCallback((nonce) =>
			tamperPayload(signJwt(claimsFor(nonce), casdoorKey.privateKey), {
				roles: [
					{
						isEnabled: true,
						name: "automationstack-admin",
						owner: "automationstack",
					},
				],
			})
		);
		expect(result.errorCode).toBe("token-failed");
		expect(warning).toMatch(SIGNATURE_FAILED);
		expect(mocks.upsert).not.toHaveBeenCalled();
	});

	it("用其他密钥签名：token-failed，不写用户", async () => {
		const { result, warning } = await runCallback((nonce) =>
			signJwt(claimsFor(nonce), attackerKey.privateKey)
		);
		expect(result.errorCode).toBe("token-failed");
		expect(warning).toMatch(SIGNATURE_FAILED);
		expect(mocks.upsert).not.toHaveBeenCalled();
	});

	it("iss 不是公网地址：token-failed，不写用户", async () => {
		const { result, warning } = await runCallback((nonce) =>
			signJwt(
				{ ...claimsFor(nonce), iss: "https://other.example.com" },
				casdoorKey.privateKey
			)
		);
		expect(result.errorCode).toBe("token-failed");
		expect(warning).toMatch(ISS_REJECTED);
		expect(mocks.upsert).not.toHaveBeenCalled();
	});

	it("aud 不是本系统的 client id：token-failed，不写用户", async () => {
		const { result, warning } = await runCallback((nonce) =>
			signJwt(
				{ ...claimsFor(nonce), aud: "another-client" },
				casdoorKey.privateKey
			)
		);
		expect(result.errorCode).toBe("token-failed");
		expect(warning).toMatch(AUD_REJECTED);
		expect(mocks.upsert).not.toHaveBeenCalled();
	});

	it("nonce 不对：token-failed，不写用户", async () => {
		const { result, warning } = await runCallback(() =>
			signJwt(claimsFor("another-nonce"), casdoorKey.privateKey)
		);
		expect(result.errorCode).toBe("token-failed");
		expect(warning).toMatch(NONCE_REJECTED);
		expect(mocks.upsert).not.toHaveBeenCalled();
	});
});
