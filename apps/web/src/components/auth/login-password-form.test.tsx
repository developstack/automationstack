import { ORPCError } from "@orpc/client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
	type LoginCredentials,
	LoginPasswordForm,
} from "@/components/auth/login-password-form";
import { isBefore } from "@/test-dom-fixtures";

const USERNAME = "用户名";
const PASSWORD = "密码";
const SUBMIT = "登录";
const PENDING = "登录中…";
const CREDENTIALS_ERROR = "用户名或密码错误";
const NETWORK_ERROR = "无法连接服务器，请稍后重试";
const RATE_LIMIT_MESSAGE = "登录尝试过于频繁，请稍后再试";

type OnLogin = (credentials: LoginCredentials) => Promise<void>;

function renderForm(onLogin = vi.fn<OnLogin>()) {
	render(<LoginPasswordForm onLogin={onLogin} />);
	return { onLogin };
}

function usernameInput(): HTMLInputElement {
	return screen.getByLabelText(USERNAME);
}

function passwordInput(): HTMLInputElement {
	return screen.getByLabelText(PASSWORD);
}

function submitButton(): HTMLButtonElement {
	return screen.getByRole("button", { name: SUBMIT });
}

function type(input: HTMLInputElement, value: string) {
	fireEvent.change(input, { target: { value } });
}

function fillAndSubmit(username = "alice", password = "s3cret") {
	type(usernameInput(), username);
	type(passwordInput(), password);
	fireEvent.click(submitButton());
}

/** 输入框下方的提示：aria-describedby 指向的元素的文字。 */
function messageOf(input: HTMLInputElement): string {
	const id = input.getAttribute("aria-describedby");
	return id === null ? "" : (document.getElementById(id)?.textContent ?? "");
}

function rejectWith(error: unknown) {
	return vi.fn<OnLogin>().mockRejectedValue(error);
}

describe("LoginPasswordForm：提交时校验", () => {
	it.each([
		[
			"用户名和密码都为空：两个输入框下方各显示提示，请求不发出",
			"",
			"",
			[true, true],
		],
		["只有密码为空：只有密码框下方显示提示", "alice", "", [false, true]],
		["用户名只有空格时视为空", "   ", "s3cret", [true, false]],
	])("%s", (_name, username, password, [usernameEmpty, passwordEmpty]) => {
		const { onLogin } = renderForm();

		fillAndSubmit(username, password);

		expect(messageOf(usernameInput())).toBe(
			usernameEmpty ? "请输入用户名" : ""
		);
		expect(messageOf(passwordInput())).toBe(passwordEmpty ? "请输入密码" : "");
		expect(usernameInput().getAttribute("aria-invalid")).toBe(
			String(usernameEmpty)
		);
		expect(passwordInput().getAttribute("aria-invalid")).toBe(
			String(passwordEmpty)
		);
		expect(onLogin).not.toHaveBeenCalled();
	});

	it("修改输入框后，字段错误消失", () => {
		renderForm();
		fireEvent.click(submitButton());

		type(usernameInput(), "a");

		expect(messageOf(usernameInput())).toBe("");
		expect(messageOf(passwordInput())).toBe("");
		expect(passwordInput().getAttribute("aria-invalid")).toBe("false");
	});
});

describe("LoginPasswordForm：发送请求", () => {
	it("字段都已填写：用输入的用户名和密码发出请求", () => {
		const { onLogin } = renderForm(
			vi.fn<OnLogin>().mockResolvedValue(undefined)
		);

		fillAndSubmit("alice", "s3cret");

		expect(onLogin).toHaveBeenCalledTimes(1);
		expect(onLogin).toHaveBeenCalledWith({
			password: "s3cret",
			username: "alice",
		});
	});

	it("在密码框按回车提交：密码框和登录按钮在同一个表单中，按钮是提交按钮，不使用浏览器的原生校验", () => {
		renderForm();

		expect(submitButton().form?.noValidate).toBe(true);
		expect(submitButton().type).toBe("submit");
		expect(passwordInput().form).toBe(submitButton().form);
	});

	it("请求进行期间：按钮显示转圈图标和登录中…，不可点击，不重复提交", () => {
		const { onLogin } = renderForm(
			vi.fn<OnLogin>().mockReturnValue(new Promise(() => undefined))
		);

		fillAndSubmit();
		const pending = screen.getByRole("button", { name: PENDING });

		expect(pending.hasAttribute("disabled")).toBe(true);
		expect(pending.querySelector("svg.animate-spin")).not.toBeNull();

		fireEvent.click(pending);
		fireEvent.submit(pending);
		expect(onLogin).toHaveBeenCalledTimes(1);
	});
});

describe("LoginPasswordForm：服务器返回的错误", () => {
	it("未授权：密码框下方显示用户名或密码错误，密码框标红，不显示提示区", async () => {
		renderForm(
			rejectWith(new ORPCError("UNAUTHORIZED", { message: CREDENTIALS_ERROR }))
		);

		fillAndSubmit();

		await screen.findByText(CREDENTIALS_ERROR);
		expect(messageOf(passwordInput())).toBe(CREDENTIALS_ERROR);
		expect(passwordInput().getAttribute("aria-invalid")).toBe("true");
		expect(usernameInput().getAttribute("aria-invalid")).toBe("false");
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("未授权后修改任一输入框：用户名或密码错误消失", async () => {
		renderForm(rejectWith(new ORPCError("UNAUTHORIZED")));
		fillAndSubmit();
		await screen.findByText(CREDENTIALS_ERROR);

		type(usernameInput(), "bob");

		expect(screen.queryByText(CREDENTIALS_ERROR)).toBeNull();
		expect(passwordInput().getAttribute("aria-invalid")).toBe("false");
	});

	it.each([
		[
			"网络错误：登录按钮上方的提示区显示无法连接服务器，不标红输入框，按钮恢复为可点击",
			new TypeError("Failed to fetch"),
			NETWORK_ERROR,
		],
		[
			"5xx 错误：提示区显示无法连接服务器",
			new ORPCError("INTERNAL_SERVER_ERROR"),
			NETWORK_ERROR,
		],
		[
			"限流：提示区显示服务器的限流提示，不标红输入框",
			new ORPCError("TOO_MANY_REQUESTS", { message: RATE_LIMIT_MESSAGE }),
			RATE_LIMIT_MESSAGE,
		],
	])("%s", async (_name, error, message) => {
		renderForm(rejectWith(error));

		fillAndSubmit();

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toBe(message);
		expect(isBefore(alert, submitButton())).toBe(true);
		expect(submitButton().hasAttribute("disabled")).toBe(false);
		expect(usernameInput().getAttribute("aria-invalid")).toBe("false");
		expect(passwordInput().getAttribute("aria-invalid")).toBe("false");
		expect(messageOf(passwordInput())).toBe("");
	});

	it("再次提交时：清除上一次的提示区", async () => {
		const onLogin = vi
			.fn<OnLogin>()
			.mockRejectedValueOnce(new TypeError("Failed to fetch"))
			.mockReturnValueOnce(new Promise(() => undefined));
		renderForm(onLogin);
		fillAndSubmit();
		await screen.findByRole("alert");

		fireEvent.click(submitButton());

		expect(screen.queryByRole("alert")).toBeNull();
	});
});
