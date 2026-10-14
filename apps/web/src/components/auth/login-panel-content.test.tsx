import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LoginMethods } from "@/components/auth/login-methods";
import { LoginPanelContent } from "@/components/auth/login-panel-content";
import type { LoginCredentials } from "@/components/auth/login-password-form";
import { isBefore } from "@/test-dom-fixtures";

const CASDOOR_URL = "http://localhost:3000/api/auth/casdoor/login";
const CASDOOR_BUTTON = "使用 Casdoor 登录";
const CASDOOR_PENDING = "正在跳转到 Casdoor…";
const EMERGENCY_TRIGGER = "本地管理员应急登录";
const FORGOT_PASSWORD_HINT = "忘记密码请联系平台管理员";
const CASDOOR_FAILURE = "暂时不能连接 Casdoor，请稍后再试";

type OnLogin = (credentials: LoginCredentials) => Promise<void>;

const BUILT_IN: LoginMethods = {
	casdoorLoginUrl: null,
	emergencyOnly: false,
	none: false,
	password: true,
};
const CASDOOR_WITH_EMERGENCY: LoginMethods = {
	casdoorLoginUrl: CASDOOR_URL,
	emergencyOnly: true,
	none: false,
	password: true,
};
const CASDOOR_ONLY: LoginMethods = {
	casdoorLoginUrl: CASDOOR_URL,
	emergencyOnly: false,
	none: false,
	password: false,
};

interface RenderOptions {
	errorMessage?: string | null;
	methods: LoginMethods;
	onLogin?: OnLogin;
	redirectTo?: string;
}

function renderPanel({
	errorMessage = null,
	methods,
	onLogin = vi.fn<OnLogin>(),
	redirectTo,
}: RenderOptions) {
	render(
		<LoginPanelContent
			errorMessage={errorMessage}
			methods={methods}
			onLogin={onLogin}
			redirectTo={redirectTo}
		/>
	);
	return { onLogin };
}

function casdoorLink(name = CASDOOR_BUTTON): HTMLAnchorElement {
	return screen.getByRole("link", { name });
}

function emergencyTrigger(): HTMLButtonElement {
	return screen.getByRole("button", { name: EMERGENCY_TRIGGER });
}

describe("LoginPanelContent：每种认证方式显示的内容", () => {
	it("内置认证生效：显示用户名密码表单和忘记密码提示，不显示 Casdoor 按钮和应急登录区域", () => {
		renderPanel({ methods: BUILT_IN });

		expect(screen.getByLabelText("用户名")).toBeDefined();
		expect(screen.getByRole("button", { name: "登录" })).toBeDefined();
		expect(screen.getByText(FORGOT_PASSWORD_HINT)).toBeDefined();
		expect(screen.queryByRole("link", { name: CASDOOR_BUTTON })).toBeNull();
		expect(screen.queryByText(EMERGENCY_TRIGGER)).toBeNull();
	});

	it("Casdoor 认证生效并允许应急登录：显示 Casdoor 主按钮，应急登录默认折叠，没有失败信息时不显示提示", () => {
		renderPanel({ methods: CASDOOR_WITH_EMERGENCY });

		expect(casdoorLink().getAttribute("href")).toBe(CASDOOR_URL);
		expect(screen.queryByRole("alert")).toBeNull();
		expect(emergencyTrigger().getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByLabelText("用户名")).toBeNull();
		expect(screen.queryByText(FORGOT_PASSWORD_HINT)).toBeNull();
	});

	it("Casdoor 认证生效、不允许应急登录：只显示 Casdoor 主按钮，不显示应急登录区域；地址带上登录后跳转的路径", () => {
		renderPanel({ methods: CASDOOR_ONLY, redirectTo: "/projects/p1" });

		const href = new URL(casdoorLink().href);
		expect(href.searchParams.get("redirect")).toBe("/projects/p1");
		expect(screen.queryByText(EMERGENCY_TRIGGER)).toBeNull();
		expect(screen.queryByLabelText("用户名")).toBeNull();
	});

	it("Casdoor 登录失败返回：失败提示显示在标题下方、Casdoor 按钮上方", () => {
		renderPanel({
			errorMessage: CASDOOR_FAILURE,
			methods: CASDOOR_WITH_EMERGENCY,
		});

		const alert = screen.getByRole("alert");
		expect(alert.textContent).toBe(CASDOOR_FAILURE);
		expect(isBefore(screen.getByRole("heading", { level: 1 }), alert)).toBe(
			true
		);
		expect(isBefore(alert, casdoorLink())).toBe(true);
	});
});

describe("LoginPanelContent：应急登录的折叠和展开", () => {
	it("点击后展开，显示应急登录表单；再次点击后折叠", async () => {
		renderPanel({ methods: CASDOOR_WITH_EMERGENCY });

		fireEvent.click(emergencyTrigger());

		expect(emergencyTrigger().getAttribute("aria-expanded")).toBe("true");
		expect(screen.getByLabelText("用户名")).toBeDefined();
		expect(screen.getByRole("button", { name: "显示密码" })).toBeDefined();

		fireEvent.click(emergencyTrigger());

		expect(emergencyTrigger().getAttribute("aria-expanded")).toBe("false");
		await waitFor(() => {
			expect(screen.queryByLabelText("用户名")).toBeNull();
		});
	});

	it("展开后的表单：填写后提交，用 onLogin 发出请求并显示 loading", () => {
		const onLogin = vi
			.fn<OnLogin>()
			.mockReturnValue(new Promise(() => undefined));
		renderPanel({ methods: CASDOOR_WITH_EMERGENCY, onLogin });
		fireEvent.click(emergencyTrigger());

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

describe("LoginPanelContent：Casdoor 按钮的 pending 状态", () => {
	// 记录每次点击到达 window 时是否已被阻止，然后阻止 jsdom 的跳转（jsdom 不支持跳转）
	const clicks: boolean[] = [];
	const recordClick = (event: MouseEvent) => {
		clicks.push(event.defaultPrevented);
		event.preventDefault();
	};

	beforeEach(() => {
		clicks.length = 0;
		window.addEventListener("click", recordClick);
	});

	afterEach(() => {
		window.removeEventListener("click", recordClick);
	});

	it("点击后：显示转圈图标和正在跳转到 Casdoor…，并且不可再次点击", () => {
		renderPanel({ methods: CASDOOR_WITH_EMERGENCY });

		fireEvent.click(casdoorLink());

		const pending = casdoorLink(CASDOOR_PENDING);
		expect(pending.getAttribute("aria-disabled")).toBe("true");
		expect(pending.querySelector(".animate-spin")).not.toBeNull();

		fireEvent.click(pending);

		expect(clicks).toEqual([false, true]);
	});

	it("按住 Ctrl 或 Command 点击（在新标签页打开）：不进入 pending", () => {
		renderPanel({ methods: CASDOOR_ONLY });

		fireEvent.click(casdoorLink(), { metaKey: true });
		fireEvent.click(casdoorLink(), { ctrlKey: true });

		expect(casdoorLink().hasAttribute("aria-disabled")).toBe(false);
	});

	it("浏览器后退并从缓存恢复页面：按钮恢复为可点击", () => {
		renderPanel({ methods: CASDOOR_ONLY });
		fireEvent.click(casdoorLink());

		act(() => {
			window.dispatchEvent(
				new PageTransitionEvent("pageshow", { persisted: true })
			);
		});

		expect(casdoorLink().hasAttribute("aria-disabled")).toBe(false);
	});
});
