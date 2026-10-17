import type {
	CaseSnapshot,
	CaseStep,
} from "@automationstack/db/schema/test-cases";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { diffCaseSnapshots } from "@/components/versions/field-diff";
import { VersionDiff } from "@/components/versions/version-diff";

const STEP_SHOTS_NAME = /步截图$/;

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

function renderDiff(oldSnapshot = makeSnapshot()) {
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
			imageUrls={IMAGE_URLS}
			targetVersion={5}
		/>
	);
}

const IMAGE_URLS = new Map([["a", "https://r2.example/a.png"]]);

type StepShots = Pick<CaseStep, "actionScreenshots" | "expectedScreenshots">;

/** 只有第 1 步的截图不同的两个版本。 */
function renderShots(oldShots: StepShots, newShots: StepShots) {
	const base = makeSnapshot();
	const [first, ...rest] = base.steps as [CaseStep, ...CaseStep[]];
	const withShots = (shots: StepShots) => ({
		...base,
		steps: [{ ...first, ...shots }, ...rest],
	});
	render(
		<VersionDiff
			baseVersion={1}
			diff={diffCaseSnapshots(withShots(oldShots), withShots(newShots))}
			imageUrls={IMAGE_URLS}
			targetVersion={2}
		/>
	);
}

const ACTION_LIST = "第 1 步操作截图";
const EXPECTED_LIST = "第 1 步预期截图";

/** 一组截图中每张缩略图的标签，没有标签是 null；这一组不显示时为 null。 */
function shotBadges(name: string): (string | null)[] | null {
	const list = screen.queryByRole("list", { name });
	if (list === null) {
		return null;
	}
	return within(list)
		.getAllByRole("listitem")
		.map((item) => item.querySelector("[data-tone]")?.textContent ?? null);
}

/** 截图所在的栏：2 是「操作步骤」，3 是「预期结果」。 */
function columnOf(name: string): number | null {
	const cell = screen.getByRole("list", { name }).closest("td");
	return cell instanceof HTMLTableCellElement ? cell.cellIndex : null;
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

	it("旧数据中步骤的 screenshots 字段不显示", () => {
		const base = makeSnapshot();
		const legacyStep = { ...base.steps[0], screenshots: ["a"] } as CaseStep;
		renderDiff({ ...base, steps: [legacyStep, ...base.steps.slice(1)] });
		expect(screen.queryByRole("list", { name: STEP_SHOTS_NAME })).toBeNull();
		expect(screen.queryByRole("img")).toBeNull();
	});

	it("移动的步骤显示旧序号和新序号", () => {
		const base = makeSnapshot();
		const [first, second] = base.steps as [CaseStep, CaseStep];
		render(
			<VersionDiff
				baseVersion={1}
				diff={diffCaseSnapshots(base, { ...base, steps: [second, first] })}
				imageUrls={IMAGE_URLS}
				targetVersion={2}
			/>
		);
		expect(screen.getByText("1 → 2")).toBeTruthy();
		expect(screen.getByText("2 → 1")).toBeTruthy();
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

describe("VersionDiff：操作截图和预期截图的变化显示在各自一栏", () => {
	it.each([
		[
			"只有操作截图变化，预期结果一栏不显示截图",
			{ actionScreenshots: ["a", "b", "c"] },
			{ actionScreenshots: ["b", "a", "d"] },
			[null, "移动", "新增", "删除"],
			null,
		],
		[
			"只有预期截图变化，操作步骤一栏不显示截图",
			{ expectedScreenshots: ["x"] },
			{ expectedScreenshots: [] },
			null,
			["删除"],
		],
		[
			"两组同时变化，没有变化的截图不加标签",
			{ actionScreenshots: ["a"], expectedScreenshots: ["x", "y"] },
			{ actionScreenshots: ["a", "b"], expectedScreenshots: ["y", "x"] },
			[null, "新增"],
			[null, "移动"],
		],
	])("%s", (...[, oldShots, newShots, action, expected]) => {
		renderShots(oldShots, newShots);
		expect(shotBadges(ACTION_LIST)).toEqual(action);
		expect(shotBadges(EXPECTED_LIST)).toEqual(expected);
		if (action !== null) {
			expect(columnOf(ACTION_LIST)).toBe(2);
		}
		if (expected !== null) {
			expect(columnOf(EXPECTED_LIST)).toBe(3);
		}
	});

	it("大图浏览显示当前截图的变化", () => {
		renderShots(
			{ actionScreenshots: ["a", "b"] },
			{ actionScreenshots: ["a"] }
		);
		fireEvent.click(screen.getByRole("button", { name: "查看操作截图 2" }));
		const dialog = screen.getByRole("dialog", {
			name: "第 1 步 · 操作截图 2/2",
		});
		expect(within(dialog).getByText("删除")).toBeTruthy();
	});
});
