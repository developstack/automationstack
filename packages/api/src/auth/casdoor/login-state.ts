import { CASDOOR_ROUTE_PREFIX } from "../casdoor-paths";
import { signJson, verifySignedJson } from "../hmac";
import { readCookieHeader } from "../session";

/** 登录开始到回调之间的 state cookie。只在 /api/auth/casdoor 路径下发送。 */
export const CASDOOR_LOGIN_COOKIE = "automationstack_casdoor_login";

const LOGIN_STATE_TTL_SECONDS = 600;
const MS_PER_SECOND = 1000;

/** state cookie 中的数据。cookie 用 SESSION_SECRET 签名，浏览器不能修改。 */
export interface LoginState {
	/** 登录开始时的连接参数指纹。回调时指纹不同，登录失败（§10.4）。 */
	fingerprint: string;
	nonce: string;
	/** 登录完成后跳转的前端地址，已经校验为同源。 */
	redirect: string;
	state: string;
	verifier: string;
}

interface SignedLoginState extends LoginState {
	exp: number;
}

function cookieAttributes(maxAge: number, secure: boolean): string {
	// SameSite=Lax：从 Casdoor 跳回时是顶层 GET 导航，浏览器会发送这个 cookie。
	const base = `Path=${CASDOOR_ROUTE_PREFIX}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
	return secure ? `${base}; Secure` : base;
}

export async function loginStateCookieHeader(
	state: LoginState,
	secret: string,
	options: { now?: number; secure: boolean }
): Promise<string> {
	const now = options.now ?? Date.now();
	const payload: SignedLoginState = {
		...state,
		exp: now + LOGIN_STATE_TTL_SECONDS * MS_PER_SECOND,
	};
	const value = await signJson(payload, secret);
	return `${CASDOOR_LOGIN_COOKIE}=${value}; ${cookieAttributes(LOGIN_STATE_TTL_SECONDS, options.secure)}`;
}

export function clearLoginStateCookieHeader(secure: boolean): string {
	return `${CASDOOR_LOGIN_COOKIE}=; ${cookieAttributes(0, secure)}`;
}

function isLoginState(value: unknown): value is SignedLoginState {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const record = value as Record<string, unknown>;
	const textFields = ["fingerprint", "nonce", "redirect", "state", "verifier"];
	return (
		typeof record.exp === "number" &&
		textFields.every((field) => typeof record[field] === "string")
	);
}

/** 读取并校验 state cookie。没有 cookie、签名错误或已过期时返回 null。 */
export async function readLoginState(
	cookieHeader: string | null | undefined,
	secret: string,
	now: number = Date.now()
): Promise<LoginState | null> {
	const token = readCookieHeader(cookieHeader, CASDOOR_LOGIN_COOKIE);
	if (!token) {
		return null;
	}
	const payload = await verifySignedJson(token, secret);
	if (!isLoginState(payload) || payload.exp <= now) {
		return null;
	}
	const { exp: _exp, ...state } = payload;
	return state;
}
