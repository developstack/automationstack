import { PASSWORD_CHANGE_REQUIRED } from "@automationstack/api/auth/password-change-gate";
import { ORPCError } from "@orpc/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	CHANGE_PASSWORD_PATHNAME,
	isChangePasswordPathname,
	isPasswordChangeRequiredError,
	notifyPasswordChangeRequired,
	setPasswordChangeRequiredHandler,
} from "./password-change";
import { isUnauthorizedError } from "./session-expiry";

describe("isPasswordChangeRequiredError", () => {
	it("只认 PASSWORD_CHANGE_REQUIRED", () => {
		const error = new ORPCError(PASSWORD_CHANGE_REQUIRED, { status: 403 });
		expect(isPasswordChangeRequiredError(error)).toBe(true);
		expect(isPasswordChangeRequiredError(new ORPCError("FORBIDDEN"))).toBe(
			false
		);
		expect(isPasswordChangeRequiredError(new Error("x"))).toBe(false);
	});

	it("不会被当成会话过期", () => {
		const error = new ORPCError(PASSWORD_CHANGE_REQUIRED, { status: 403 });
		expect(isUnauthorizedError(error)).toBe(false);
	});
});

describe("isChangePasswordPathname", () => {
	it("精确匹配，允许一个尾斜杠", () => {
		expect(isChangePasswordPathname(CHANGE_PASSWORD_PATHNAME)).toBe(true);
		expect(isChangePasswordPathname(`${CHANGE_PASSWORD_PATHNAME}/`)).toBe(true);
		expect(isChangePasswordPathname("/projects")).toBe(false);
	});
});

describe("notifyPasswordChangeRequired", () => {
	beforeEach(() => {
		setPasswordChangeRequiredHandler(null);
	});

	it("同时多次触发只跳转一次，跳转结束后可以再次触发", async () => {
		let finish: () => void = () => undefined;
		const handler = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);
		setPasswordChangeRequiredHandler(handler);

		notifyPasswordChangeRequired();
		notifyPasswordChangeRequired();
		expect(handler).toHaveBeenCalledTimes(1);

		finish();
		await vi.waitFor(() => {
			notifyPasswordChangeRequired();
			expect(handler).toHaveBeenCalledTimes(2);
		});
	});

	it("没有处理器时不抛错", () => {
		expect(() => notifyPasswordChangeRequired()).not.toThrow();
	});
});
