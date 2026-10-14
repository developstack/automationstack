import type { CaseSnapshot } from "@automationstack/db/schema/test-cases";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { diffCaseSnapshots } from "@/components/versions/field-diff";
import { VersionDiff } from "@/components/versions/version-diff";

const PALETTE_COLOR_PATTERN =
	/\b(?:amber|emerald|green|red|rose|lime|yellow|orange|sky|blue)-\d{2,3}\b/;

function makeSnapshot(overrides: Partial<CaseSnapshot> = {}): CaseSnapshot {
	return {
		caseType: "functional",
		maintainer: "alice",
		moduleId: "11111111-1111-4111-8111-111111111111",
		name: "登录成功",
		preconditions: "已注册账号",
		priority: "P1",
		sourceRef: null,
		status: "draft",
		steps: [
			{ expected: "展示登录表单", id: "s1", step: "打开登录页" },
			{ expected: "提示密码错误", id: "s2", step: "输入错误密码" },
		],
		tags: ["smoke", "login"],
		...overrides,
	};
}

function renderDiff() {
	const oldSnapshot = makeSnapshot();
	const newSnapshot = makeSnapshot({
		name: "登录成功后跳转首页",
		preconditions: "已注册并激活账号",
		status: "active",
		steps: [
			{ expected: "展示登录表单", id: "s1", step: "打开登录页面" },
			{ expected: "进入首页", id: "s3", step: "点击登录" },
		],
		tags: ["smoke", "auth"],
	});
	return render(
		<VersionDiff
			baseVersion={3}
			diff={diffCaseSnapshots(oldSnapshot, newSnapshot)}
			targetVersion={5}
		/>
	);
}

describe("VersionDiff：新增和删除的内容不只用颜色区分", () => {
	it.each([
		["新增的内容带下划线，读屏软件读出「新增」", "ins", "underline", "新增："],
		[
			"删除的内容带删除线，读屏软件读出「删除」",
			"del",
			"line-through",
			"删除：",
		],
	])("%s", (_name, tag, className, spoken) => {
		const { container } = renderDiff();
		const changes = [...container.querySelectorAll(tag)];
		expect(changes.length).toBeGreaterThan(0);
		for (const change of changes) {
			expect(change.className).toContain(className);
			expect(change.querySelector(".sr-only")?.textContent).toBe(spoken);
		}
	});

	it("新增和删除的标签前有 + 和 − 符号", () => {
		renderDiff();
		const added = screen.getByText("auth").closest("ins");
		const removed = screen.getByText("login").closest("del");
		expect(added?.textContent).toContain("+");
		expect(removed?.textContent).toContain("−");
	});

	it("步骤的变化用统一状态标签显示文字", () => {
		const { container } = renderDiff();
		const tones = [...container.querySelectorAll("[data-tone]")].map(
			(badge) => badge.textContent
		);
		expect(tones).toEqual(expect.arrayContaining(["新增", "删除", "修改"]));
	});

	it("修改的用例状态，旧值和新值都用统一状态标签", () => {
		const { container } = renderDiff();
		const deleted = [...container.querySelectorAll("del [data-tone]")];
		const inserted = [...container.querySelectorAll("ins [data-tone]")];
		expect(deleted.map((badge) => badge.textContent)).toContain("草稿");
		expect(inserted.map((badge) => badge.textContent)).toContain("生效");
	});

	it("所有颜色来自主题令牌，浅色和暗色模式各自取值", () => {
		const { container } = renderDiff();
		for (const element of container.querySelectorAll("[class]")) {
			expect(element.getAttribute("class")).not.toMatch(PALETTE_COLOR_PATTERN);
		}
	});

	it("版本号用等宽字体", () => {
		renderDiff();
		expect(screen.getByText("v3").className).toContain("numeric");
		expect(screen.getByText("v5").className).toContain("numeric");
	});
});
