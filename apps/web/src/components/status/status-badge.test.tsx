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

const CASES: readonly BadgeExample[] = [
	{
		label: "通过",
		status: { kind: "result", value: "passed" },
		tone: "success",
	},
	{
		label: "失败",
		status: { kind: "result", value: "failed" },
		tone: "danger",
	},
	{
		label: "阻塞",
		status: { kind: "result", value: "blocked" },
		tone: "warning",
	},
	{
		label: "跳过",
		status: { kind: "result", value: "skipped" },
		tone: "neutral",
	},
	{
		label: "未测",
		status: { kind: "result", value: "untested" },
		tone: "neutral",
	},
	{
		label: "待评审",
		status: { kind: "runStatus", value: "pending_review" },
		tone: "outline",
	},
	{
		label: "待测试",
		status: { kind: "runStatus", value: "ready" },
		tone: "info-outline",
	},
	{
		label: "测试中",
		status: { kind: "runStatus", value: "in_progress" },
		tone: "info",
	},
	{
		label: "已完成",
		status: { kind: "runStatus", value: "completed" },
		tone: "solid",
	},
	{
		label: "已提交",
		status: { kind: "runStatus", value: "submitted" },
		tone: "solid",
	},
	{
		label: "草稿",
		status: { kind: "caseStatus", value: "draft" },
		tone: "outline",
	},
	{
		label: "生效",
		status: { kind: "caseStatus", value: "active" },
		tone: "success",
	},
	{
		label: "废弃",
		status: { kind: "caseStatus", value: "deprecated" },
		tone: "struck",
	},
	{
		label: "P0",
		status: { kind: "priority", value: "P0" },
		tone: "priority-strong",
	},
	{ label: "P1", status: { kind: "priority", value: "P1" }, tone: "priority" },
	{ label: "P2", status: { kind: "priority", value: "P2" }, tone: "priority" },
	{ label: "P3", status: { kind: "priority", value: "P3" }, tone: "priority" },
];

describe("StatusBadge", () => {
	it.each(CASES)(
		"$status.kind $status.value 显示「$label」，样式是 $tone",
		({ label, status, tone }) => {
			render(<StatusBadge {...status} />);
			const badge = screen.getByText(label);
			expect(badge.closest("[data-tone]")?.getAttribute("data-tone")).toBe(
				tone
			);
		}
	);

	it("废弃的文字带删除线", () => {
		render(<StatusBadge kind="caseStatus" value="deprecated" />);
		expect(
			screen.getByText("废弃").closest("[data-tone]")?.className
		).toContain("line-through");
	});

	it("优先级用等宽字体，只有 P0 加粗", () => {
		render(
			<>
				<StatusBadge kind="priority" value="P0" />
				<StatusBadge kind="priority" value="P1" />
			</>
		);
		const p0 = screen.getByText("P0").closest("[data-tone]")?.className ?? "";
		const p1 = screen.getByText("P1").closest("[data-tone]")?.className ?? "";
		expect(p0).toContain("numeric");
		expect(p0).toContain("font-semibold");
		expect(p1).toContain("numeric");
		expect(p1).not.toContain("font-semibold");
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

describe("STATUS_TONE_CLASSES", () => {
	it.each(CASES)(
		"「$label」的标签带 $tone 样式的颜色类",
		({ label, status, tone }) => {
			render(<StatusBadge {...status} />);
			const classes = (
				screen.getByText(label).closest("[data-tone]")?.className ?? ""
			).split(" ");
			for (const keyClass of TONE_KEY_CLASSES[tone]) {
				expect(classes).toContain(keyClass);
			}
		}
	);

	it.each(Object.entries(STATUS_TONE_CLASSES))(
		"样式 %s 只用主题令牌，不写死颜色",
		(_tone, classes) => {
			expect(classes).not.toMatch(PALETTE_COLOR_PATTERN);
		}
	);
});
