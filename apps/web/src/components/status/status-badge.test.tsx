import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
	StatusBadge,
	type StatusBadgeValue,
} from "@/components/status/status-badge";
import {
	STATUS_TONE_CLASSES,
	type StatusTone,
} from "@/components/status/status-badge-meta";

const PALETTE_COLOR_PATTERN =
	/\b(?:amber|emerald|green|red|rose|lime|yellow|orange|sky|blue)-\d{2,3}\b/;

interface BadgeExample {
	label: string;
	status: StatusBadgeValue;
	tone: StatusTone;
}

const badge = (
	label: string,
	status: StatusBadgeValue,
	tone: StatusTone
): BadgeExample => ({ label, status, tone });

const CASES: readonly BadgeExample[] = [
	badge("通过", { kind: "result", value: "passed" }, "success"),
	badge("失败", { kind: "result", value: "failed" }, "danger"),
	badge("阻塞", { kind: "result", value: "blocked" }, "warning"),
	badge("跳过", { kind: "result", value: "skipped" }, "neutral"),
	badge("未测", { kind: "result", value: "untested" }, "neutral"),
	badge("待评审", { kind: "runStatus", value: "pending_review" }, "outline"),
	badge("待测试", { kind: "runStatus", value: "ready" }, "info-outline"),
	badge("测试中", { kind: "runStatus", value: "in_progress" }, "info"),
	badge("已完成", { kind: "runStatus", value: "completed" }, "solid"),
	badge("已提交", { kind: "runStatus", value: "submitted" }, "solid"),
	badge("已作废", { kind: "runStatus", value: "voided" }, "neutral"),
	badge("草稿", { kind: "caseStatus", value: "draft" }, "outline"),
	badge("生效", { kind: "caseStatus", value: "active" }, "success"),
	badge("废弃", { kind: "caseStatus", value: "deprecated" }, "struck"),
	badge("P0", { kind: "priority", value: "P0" }, "priority-p0"),
	badge("P1", { kind: "priority", value: "P1" }, "priority-p1"),
	badge("P2", { kind: "priority", value: "P2" }, "priority-p2"),
	badge("P3", { kind: "priority", value: "P3" }, "priority-p3"),
	badge("新增", { kind: "change", value: "added" }, "success"),
	badge("删除", { kind: "change", value: "removed" }, "danger"),
	badge("修改", { kind: "change", value: "modified" }, "warning"),
	badge("移动", { kind: "change", value: "moved" }, "info-outline"),
	badge("未变", { kind: "change", value: "unchanged" }, "neutral"),
];

const TONE_KEY_CLASSES: Record<StatusTone, readonly string[]> = {
	danger: ["bg-destructive-soft", "text-destructive-soft-foreground"],
	info: ["bg-info-soft", "text-info-soft-foreground"],
	"info-outline": ["border-info/40", "text-info"],
	neutral: ["bg-muted", "text-muted-foreground"],
	outline: ["border-muted-foreground/40", "text-muted-foreground"],
	"priority-p0": [
		"numeric",
		"bg-destructive",
		"text-destructive-foreground",
		"font-semibold",
	],
	"priority-p1": [
		"numeric",
		"border-warning/20",
		"bg-warning-soft",
		"text-warning-soft-foreground",
	],
	"priority-p2": [
		"numeric",
		"border-info/20",
		"bg-info-soft",
		"text-info-soft-foreground",
	],
	"priority-p3": [
		"numeric",
		"border-muted-foreground/40",
		"text-muted-foreground",
	],
	solid: ["bg-neutral-solid", "text-neutral-solid-foreground"],
	struck: ["bg-muted", "text-muted-foreground", "line-through"],
	success: ["bg-success-soft", "text-success-soft-foreground"],
	warning: ["bg-warning-soft", "text-warning-soft-foreground"],
};

describe("StatusBadge", () => {
	it.each(CASES)(
		"$status.kind $status.value 显示「$label」，样式是 $tone，带这个样式的颜色类",
		({ label, status, tone }) => {
			render(<StatusBadge {...status} />);
			const badgeElement = screen.getByText(label).closest("[data-tone]");
			expect(badgeElement?.getAttribute("data-tone")).toBe(tone);
			const classes = (badgeElement?.className ?? "").split(" ");
			for (const keyClass of TONE_KEY_CLASSES[tone]) {
				expect(classes).toContain(keyClass);
			}
			// 每种标签的形状相同：都有内边距
			expect(classes).toContain("px-1.5");
		}
	);

	it("P0 是实底，执行结果「失败」是浅底，两者的 class 不同", () => {
		render(
			<>
				<StatusBadge kind="priority" value="P0" />
				<StatusBadge kind="result" value="failed" />
			</>
		);
		const classesOf = (text: string): string[] =>
			(screen.getByText(text).closest("[data-tone]")?.className ?? "").split(
				" "
			);
		const p0 = classesOf("P0");
		const failed = classesOf("失败");
		expect(p0).toContain("bg-destructive");
		expect(p0).not.toContain("bg-destructive-soft");
		expect(failed).toContain("bg-destructive-soft");
		expect(failed).not.toContain("bg-destructive");
	});

	it("执行结果带图标，图标对读屏软件隐藏", () => {
		const { container } = render(<StatusBadge kind="result" value="failed" />);
		const icon = container.querySelector("svg");
		expect(icon).not.toBeNull();
		expect(icon?.getAttribute("aria-hidden")).toBe("true");
	});

	it("可以传入图标替换默认图标", () => {
		render(
			<StatusBadge
				icon={<i data-testid="custom" />}
				kind="result"
				value="passed"
			/>
		);
		expect(screen.getByTestId("custom")).toBeDefined();
	});
});

describe("STATUS_TONE_CLASSES", () => {
	it.each(Object.entries(STATUS_TONE_CLASSES))(
		"样式 %s 只用主题令牌，不写死颜色",
		(_tone, classes) => {
			expect(classes).not.toMatch(PALETTE_COLOR_PATTERN);
		}
	);
});
