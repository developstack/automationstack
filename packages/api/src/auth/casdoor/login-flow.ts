import {
	authorizationCodeGrant,
	buildAuthorizationUrl,
	calculatePKCECodeChallenge,
	randomNonce,
	randomPKCECodeVerifier,
	randomState,
} from "openid-client";

import { createSessionToken, sessionCookieHeader } from "../session";
import type { EffectiveAuthSettings } from "../settings-model";
import { identityFromClaims } from "./claims";
import {
	type CasdoorConnection,
	connectionFingerprint,
	connectionFromSettings,
} from "./connection";
import {
	CASDOOR_LOGIN_ERROR_PARAM,
	type CasdoorLoginErrorCode,
} from "./login-errors";
import {
	clearLoginStateCookieHeader,
	type LoginState,
	loginStateCookieHeader,
	readLoginState,
} from "./login-state";
import { upsertCasdoorLoginUser, type WarnLog } from "./login-user";
import { getOidcClient } from "./oidc";
import { describeError } from "./redact";
import { safeRedirectTarget } from "./redirect-target";

const OIDC_SCOPE = "openid profile email";

/** 登录路由的响应：跳转地址和要设置的 cookie。 */
export interface CasdoorRedirect {
	cookies: string[];
	/** 失败时的错误码。成功时为 null。 */
	errorCode: CasdoorLoginErrorCode | null;
	location: string;
}

export interface LoginFlowContext {
	/** 前端地址（CORS_ORIGIN）。 */
	frontendOrigin: string;
	secure: boolean;
	sessionSecret: string;
	settings: EffectiveAuthSettings;
	warn?: WarnLog;
}

export interface LoginFlowDeps {
	getClient: typeof getOidcClient;
	grant: typeof authorizationCodeGrant;
}

const defaultDeps: LoginFlowDeps = {
	getClient: getOidcClient,
	grant: authorizationCodeGrant,
};

function failure(
	context: LoginFlowContext,
	code: CasdoorLoginErrorCode,
	cookies: string[] = []
): CasdoorRedirect {
	const location = new URL("/login", context.frontendOrigin);
	location.searchParams.set(CASDOOR_LOGIN_ERROR_PARAM, code);
	return { cookies, errorCode: code, location: location.href };
}

function connectionOf(
	context: LoginFlowContext
): CasdoorConnection | CasdoorLoginErrorCode {
	if (context.settings.provider !== "casdoor") {
		return "not-enabled";
	}
	return connectionFromSettings(context.settings) ?? "not-configured";
}

/** GET /api/auth/casdoor/login：生成 state、PKCE（S256）和 nonce，跳转到 Casdoor（T10）。 */
export async function startCasdoorLogin(
	context: LoginFlowContext,
	requestedRedirect: string | null,
	deps: LoginFlowDeps = defaultDeps
): Promise<CasdoorRedirect> {
	const connection = connectionOf(context);
	if (typeof connection === "string") {
		return failure(context, connection);
	}
	const warn = context.warn ?? console.warn;
	let client: Awaited<ReturnType<typeof getOidcClient>>;
	try {
		client = await deps.getClient(connection);
	} catch (error) {
		warn(
			`Casdoor 登录：读取发现文档失败：${describeError(error, [connection.clientSecret])}`
		);
		return failure(context, "unavailable");
	}
	const state: LoginState = {
		fingerprint: client.fingerprint,
		nonce: randomNonce(),
		redirect: safeRedirectTarget(requestedRedirect, context.frontendOrigin),
		state: randomState(),
		verifier: randomPKCECodeVerifier(),
	};
	const location = buildAuthorizationUrl(client.config, {
		code_challenge: await calculatePKCECodeChallenge(state.verifier),
		code_challenge_method: "S256",
		nonce: state.nonce,
		redirect_uri: connection.redirectUrl,
		scope: OIDC_SCOPE,
		state: state.state,
	});
	const cookie = await loginStateCookieHeader(state, context.sessionSecret, {
		secure: context.secure,
	});
	return { cookies: [cookie], errorCode: null, location: location.href };
}

type CheckedCallback =
	| { code: CasdoorLoginErrorCode; kind: "error" }
	| { connection: CasdoorConnection; kind: "ok"; state: LoginState };

async function checkCallback(
	context: LoginFlowContext,
	cookieHeader: string | null | undefined,
	query: URLSearchParams
): Promise<CheckedCallback> {
	const connection = connectionOf(context);
	if (typeof connection === "string") {
		return { code: connection, kind: "error" };
	}
	const state = await readLoginState(cookieHeader, context.sessionSecret);
	if (state === null) {
		return { code: "state-invalid", kind: "error" };
	}
	if (query.has("error")) {
		return { code: "access-denied", kind: "error" };
	}
	if (query.get("state") !== state.state) {
		return { code: "state-invalid", kind: "error" };
	}
	if ((await connectionFingerprint(connection)) !== state.fingerprint) {
		return { code: "settings-changed", kind: "error" };
	}
	return { connection, kind: "ok", state };
}

async function exchangeCode(
	connection: CasdoorConnection,
	state: LoginState,
	query: URLSearchParams,
	deps: LoginFlowDeps
): Promise<Record<string, unknown> | undefined> {
	const { config } = await deps.getClient(connection);
	// openid-client 用 currentUrl 去掉查询后的地址作为 redirect_uri。
	// 服务端收到的请求地址可能是集群内地址，所以用配置的回调地址。
	const currentUrl = new URL(connection.redirectUrl);
	currentUrl.search = query.toString();
	const tokens = await deps.grant(config, currentUrl, {
		expectedNonce: state.nonce,
		expectedState: state.state,
		idTokenExpected: true,
		pkceCodeVerifier: state.verifier,
	});
	return tokens.claims();
}

/** GET /api/auth/casdoor/callback：校验 state，换取 token，同步本地用户，签发会话 cookie（T10）。 */
export async function completeCasdoorLogin(
	context: LoginFlowContext,
	request: { cookieHeader: string | null | undefined; query: URLSearchParams },
	deps: LoginFlowDeps = defaultDeps
): Promise<CasdoorRedirect> {
	const warn = context.warn ?? console.warn;
	const clearState = clearLoginStateCookieHeader(context.secure);
	const checked = await checkCallback(
		context,
		request.cookieHeader,
		request.query
	);
	if (checked.kind === "error") {
		return failure(context, checked.code, [clearState]);
	}
	const { connection, state } = checked;
	let claims: Record<string, unknown> | undefined;
	try {
		claims = await exchangeCode(connection, state, request.query, deps);
	} catch (error) {
		warn(
			`Casdoor 登录：换取 token 失败：${describeError(error, [connection.clientSecret])}`
		);
		return failure(context, "token-failed", [clearState]);
	}
	const identity = identityFromClaims(claims ?? {}, connection);
	if (identity.kind === "rejected") {
		warn(`Casdoor 登录被拒绝：ID token 不符合要求（${identity.reason}）。`);
		return failure(context, "identity-rejected", [clearState]);
	}
	const outcome = await upsertCasdoorLoginUser(identity.identity, warn);
	if (outcome.kind !== "ok") {
		return failure(
			context,
			outcome.kind === "disabled" ? "account-disabled" : "username-conflict",
			[clearState]
		);
	}
	const token = await createSessionToken(
		outcome.user.id,
		context.sessionSecret
	);
	return {
		cookies: [clearState, sessionCookieHeader(token, context.secure)],
		errorCode: null,
		location: state.redirect,
	};
}
