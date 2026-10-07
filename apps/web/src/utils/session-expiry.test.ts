import { ORPCError } from "@orpc/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	isLoginPathname,
	isUnauthorizedError,
	LOGIN_PATHNAME,
	notifySessionExpired,
	resetSessionExpiredNotice,
	setSessionExpiredHandler,
} from "./session-expiry";

describe("isUnauthorizedError：只认 UNAUTHORIZED", () => {
	it("UNAUTHORIZED 的 ORPCError 为真", () => {
		const error = new ORPCError("UNAUTHORIZED", { defined: true });
		expect(isUnauthorizedError(error)).toBe(true);
	});

	it("其他 code 的 ORPCError 为假——业务拒绝不该把人踢下线", () => {
		expect(isUnauthorizedError(new ORPCError("FORBIDDEN"))).toBe(false);
		expect(isUnauthorizedError(new ORPCError("BAD_REQUEST"))).toBe(false);
		expect(isUnauthorizedError(new ORPCError("INTERNAL_SERVER_ERROR"))).toBe(
			false
		);
	});

	it("非 ORPCError 一律为假", () => {
		expect(isUnauthorizedError(new Error("UNAUTHORIZED"))).toBe(false);
		expect(isUnauthorizedError("UNAUTHORIZED")).toBe(false);
		expect(isUnauthorizedError(null)).toBe(false);
		expect(isUnauthorizedError(undefined)).toBe(false);
	});
});

describe("isLoginPathname：字符串精确匹配，不做归一化", () => {
	it("登录页本身命中，带一个尾斜杠也命中", () => {
		expect(isLoginPathname(LOGIN_PATHNAME)).toBe(true);
		expect(isLoginPathname(`${LOGIN_PATHNAME}/`)).toBe(true);
	});

	it("其他路径不命中", () => {
		expect(isLoginPathname("/")).toBe(false);
		expect(isLoginPathname("/dashboard")).toBe(false);
	});

	it("大小写不同不命中——实现是严格相等，没有做大小写归一化", () => {
		expect(isLoginPathname("/Login")).toBe(false);
		expect(isLoginPathname("/LOGIN")).toBe(false);
	});

	it("login 路径下的子路径不命中——只认恰好等于 /login 或 /login/", () => {
		expect(isLoginPathname("/login/callback")).toBe(false);
		expect(isLoginPathname("/login//")).toBe(false);
	});

	it("前缀或后缀相似但不是同一个词也不命中", () => {
		expect(isLoginPathname("/loginx")).toBe(false);
		expect(isLoginPathname("/relogin")).toBe(false);
	});
});

describe("会话过期回调槽：注册、收敛、复位", () => {
	beforeEach(() => {
		setSessionExpiredHandler(null);
		resetSessionExpiredNotice();
	});

	it("没有注册处理器时调用不抛错", () => {
		expect(() => notifySessionExpired()).not.toThrow();
	});

	it("注册后被调到", () => {
		const handler = vi.fn();
		setSessionExpiredHandler(handler);

		notifySessionExpired();

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("同一次失效被多条查询同时喊到，只导航一次", () => {
		const handler = vi.fn();
		setSessionExpiredHandler(handler);

		notifySessionExpired();
		notifySessionExpired();
		notifySessionExpired();

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("reset 之后能再次触发——跳转失败后要允许下一次 401 重试", () => {
		const handler = vi.fn();
		setSessionExpiredHandler(handler);
		notifySessionExpired();
		expect(handler).toHaveBeenCalledTimes(1);

		resetSessionExpiredNotice();
		notifySessionExpired();

		expect(handler).toHaveBeenCalledTimes(2);
	});

	it("把 handler 换成 null 之后不再触发旧处理器", () => {
		const handler = vi.fn();
		setSessionExpiredHandler(handler);
		setSessionExpiredHandler(null);

		notifySessionExpired();

		expect(handler).not.toHaveBeenCalled();
	});

	it("留下未复位的状态（配合下一条验证 beforeEach 生效）", () => {
		const staleHandler = vi.fn();
		setSessionExpiredHandler(staleHandler);
		notifySessionExpired();
		expect(staleHandler).toHaveBeenCalledTimes(1);
	});

	it("上一条没有手动清理，但这里应该是干净状态——靠 beforeEach 复位", () => {
		const handler = vi.fn();
		setSessionExpiredHandler(handler);

		notifySessionExpired();

		expect(handler).toHaveBeenCalledTimes(1);
	});
});
