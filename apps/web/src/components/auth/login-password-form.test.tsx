import { ORPCError } from "@orpc/client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
	type LoginCredentials,
	LoginPasswordForm,
} from "@/components/auth/login-password-form";

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

/** a 在文档顺序中位于 b 之前。 */
function isBefore(a: Element, b: Element): boolean {
	const ordered = [...document.querySelectorAll("*")];
	return ordered.indexOf(a) < ordered.indexOf(b);
}

function rejectWith(error: unknown) {
	return vi.fn<OnLogin>().mockRejectedValue(error);
}

describe("LoginPasswordForm：提交时校验", () => {
	it("用户名和密码都为空：两个输入框下方各显示提示，请求不发出", () => {
		const { onLogin } = renderForm();

		fireEvent.click(submitButton());

		expect(messageOf(usernameInput())).toBe("请输入用户名");
		expect(messageOf(passwordInput())).toBe("请输入密码");
		expect(usernameInput().getAttribute("aria-invalid")).toBe("true");
		expect(passwordInput().getAttribute("aria-invalid")).toBe("true");
		expect(onLogin).not.toHaveBeenCalled();
	});

	it("只有密码为空：只有密码框下方显示提示", () => {
		const { onLogin } = renderForm();

		type(usernameInput(), "alice");
		fireEvent.click(submitButton());

		expect(messageOf(usernameInput())).toBe("");
		expect(usernameInput().getAttribute("aria-invalid")).toBe("false");
		expect(messageOf(passwordInput())).toBe("请输入密码");
		expect(onLogin).not.toHaveBeenCalled();
	});

	it("用户名只有空格时视为空", () => {
		const { onLogin } = renderForm();

		fillAndSubmit("   ", "s3cret");

		expect(messageOf(usernameInput())).toBe("请输入用户名");
		expect(onLogin).not.toHaveBeenCalled();
	});

	it("不使用浏览器的原生校验", () => {
		renderForm();

		expect(submitButton().form?.noValidate).toBe(true);
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

	it("在密码框按回车提交：密码框和登录按钮在同一个表单中，按钮是提交按钮", () => {
		renderForm();

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

	it("请求失败后：按钮恢复为可点击", async () => {
		renderForm(rejectWith(new TypeError("Failed to fetch")));

		fillAndSubmit();

		const button = await screen.findByRole("button", { name: SUBMIT });
		expect(button.hasAttribute("disabled")).toBe(false);
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

	it("网络错误：登录按钮上方的提示区显示无法连接服务器，不标红输入框", async () => {
		renderForm(rejectWith(new TypeError("Failed to fetch")));

		fillAndSubmit();

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toBe(NETWORK_ERROR);
		expect(isBefore(alert, submitButton())).toBe(true);
		expect(usernameInput().getAttribute("aria-invalid")).toBe("false");
		expect(passwordInput().getAttribute("aria-invalid")).toBe("false");
		expect(messageOf(passwordInput())).toBe("");
	});

	it("5xx 错误：提示区显示无法连接服务器", async () => {
		renderForm(rejectWith(new ORPCError("INTERNAL_SERVER_ERROR")));

		fillAndSubmit();

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toBe(NETWORK_ERROR);
		expect(passwordInput().getAttribute("aria-invalid")).toBe("false");
	});

	it("限流：提示区显示服务器的限流提示，不标红输入框", async () => {
		renderForm(
			rejectWith(
				new ORPCError("TOO_MANY_REQUESTS", { message: RATE_LIMIT_MESSAGE })
			)
		);

		fillAndSubmit();

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toBe(RATE_LIMIT_MESSAGE);
		expect(passwordInput().getAttribute("aria-invalid")).toBe("false");
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
