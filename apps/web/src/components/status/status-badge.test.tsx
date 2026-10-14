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
	badge("草稿", { kind: "caseStatus", value: "draft" }, "outline"),
	badge("生效", { kind: "caseStatus", value: "active" }, "success"),
	badge("废弃", { kind: "caseStatus", value: "deprecated" }, "struck"),
	badge("P0", { kind: "priority", value: "P0" }, "priority-strong"),
	badge("P1", { kind: "priority", value: "P1" }, "priority"),
	badge("P2", { kind: "priority", value: "P2" }, "priority"),
	badge("P3", { kind: "priority", value: "P3" }, "priority"),
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
	priority: ["numeric", "font-normal", "text-foreground"],
	"priority-strong": ["numeric", "font-semibold", "text-foreground"],
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
		}
	);

	it("优先级只有 P0 加粗", () => {
		render(<StatusBadge kind="priority" value="P1" />);
		expect(
			screen.getByText("P1").closest("[data-tone]")?.className
		).not.toContain("font-semibold");
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
