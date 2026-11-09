import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LoginPanelContent } from "@/components/auth/login-panel-content";
import type { LoginCredentials } from "@/components/auth/login-password-form";

type OnLogin = (credentials: LoginCredentials) => Promise<void>;

describe("LoginPanelContent", () => {
	it("显示用户名密码表单和忘记密码的提示", () => {
		render(<LoginPanelContent onLogin={vi.fn<OnLogin>()} />);

		expect(screen.getByLabelText("用户名")).toBeDefined();
		expect(screen.getByRole("button", { name: "登录" })).toBeDefined();
		expect(screen.getByText("忘记密码请联系管理员")).toBeDefined();
	});

	it("填写后提交：用 onLogin 发出请求并显示 loading", () => {
		const onLogin = vi
			.fn<OnLogin>()
			.mockReturnValue(new Promise(() => undefined));
		render(<LoginPanelContent onLogin={onLogin} />);

		fireEvent.change(screen.getByLabelText("用户名"), {
			target: { value: "admin" },
		});
		fireEvent.change(screen.getByLabelText("密码"), {
			target: { value: "s3cret" },
		});
		fireEvent.click(screen.getByRole("button", { name: "登录" }));

		expect(onLogin).toHaveBeenCalledWith({
			password: "s3cret",
			username: "admin",
		});
		expect(screen.getByRole("button", { name: "登录中…" })).toBeDefined();
	});
});
