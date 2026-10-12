import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PasswordInput } from "@/components/auth/password-input";

const LABEL = "密码";
const SHOW = "显示密码";
const HIDE = "隐藏密码";

function renderInForm(onSubmit = vi.fn()) {
	render(
		<form onSubmit={onSubmit}>
			<label htmlFor="password">{LABEL}</label>
			<PasswordInput defaultValue="s3cret" id="password" />
		</form>
	);
	return { onSubmit };
}

describe("PasswordInput", () => {
	it("默认遮盖密码，按钮名称是显示密码", () => {
		renderInForm();

		expect(screen.getByLabelText(LABEL)).toHaveProperty("type", "password");
		expect(screen.getByRole("button", { name: SHOW })).toBeDefined();
	});

	it("点击按钮显示明文，再次点击恢复遮盖", () => {
		renderInForm();
		const input = screen.getByLabelText(LABEL);

		fireEvent.click(screen.getByRole("button", { name: SHOW }));
		expect(input).toHaveProperty("type", "text");

		fireEvent.click(screen.getByRole("button", { name: HIDE }));
		expect(input).toHaveProperty("type", "password");
		expect(screen.getByRole("button", { name: SHOW })).toBeDefined();
	});

	it("点击按钮不提交表单，也不改变输入框的值", () => {
		const { onSubmit } = renderInForm();

		fireEvent.click(screen.getByRole("button", { name: SHOW }));

		expect(onSubmit).not.toHaveBeenCalled();
		expect(screen.getByLabelText(LABEL)).toHaveProperty("value", "s3cret");
	});
});
