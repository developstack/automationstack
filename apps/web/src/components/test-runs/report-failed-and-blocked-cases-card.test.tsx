import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReportFailedAndBlockedCasesCard } from "@/components/test-runs/report-failed-and-blocked-cases-card";
import type {
	ReportFailedAndBlockedCase,
	TestRunReportView,
} from "@/components/test-runs/report-meta";

const STEP_ITEM = /^第 \d 步/;
const THUMB = /^查看/;
const REFUND_ROW = /^退款/;
const SANDBOX_ROW = /^沙箱支付/;
const CHECKOUT_ROW = /^下单支付/;

const COUNTS: TestRunReportView["counts"] = {
	blocked: 1,
	failed: 2,
	passed: 0,
	skipped: 0,
	total: 3,
	untested: 0,
};

/** 一个附件：只写界面读取的字段。 */
function attachment(
	id: string,
	stepId: string | null,
	contentType: string
): ReportFailedAndBlockedCase["attachments"][number] {
	return {
		attachment: {
			contentType,
			fileName: `${id}.file`,
			id,
			sizeBytes: 1,
			stepId,
		},
		url: `https://r2.example/${id}`,
	} as ReportFailedAndBlockedCase["attachments"][number];
}

/** 一条失败或阻塞的用例：只写测试关心的字段，其他字段是默认值（失败）。 */
function failedOrBlockedCase(
	name: string,
	overrides: Partial<ReportFailedAndBlockedCase> = {}
): ReportFailedAndBlockedCase {
	return {
		attachments: [],
		automationExecution: null,
		caseId: `case-${name}`,
		comment: null,
		defectKey: null,
		defectStatus: null,
		defectTitle: null,
		defectUrl: null,
		executedAt: null,
		executedByName: null,
		executedVia: "manual",
		moduleName: "支付",
		name,
		priority: "P1",
		result: "failed",
		runCaseId: `rc-${name}`,
		steps: [],
		...overrides,
	} as ReportFailedAndBlockedCase;
}

const CHECKOUT = failedOrBlockedCase("下单支付", {
	attachments: [
		attachment("白屏", "s2", "image/png"),
		attachment("录屏", "s3", "video/webm"),
		attachment("自动化", null, "text/plain"),
		attachment("已删除步骤", "s9", "image/png"),
	],
	steps: [
		{ actualResult: null, id: "s1", position: 1, step: "打开购物车" },
		{ actualResult: "页面白屏", id: "s2", position: 2, step: "点击支付" },
		{ actualResult: null, id: "s3", position: 3, step: "确认订单" },
	],
});

const REFUND = failedOrBlockedCase("退款", {
	steps: [{ actualResult: null, id: "r1", position: 1, step: "申请退款" }],
});

const SANDBOX = failedOrBlockedCase("沙箱支付", {
	attachments: [attachment("沙箱报错", "b1", "image/png")],
	result: "blocked",
	steps: [
		{ actualResult: "沙箱账号没开通", id: "b1", position: 1, step: "选择沙箱" },
	],
});

function renderCard(cases = [CHECKOUT, REFUND, SANDBOX], counts = COUNTS) {
	render(<ReportFailedAndBlockedCasesCard cases={cases} counts={counts} />);
}

const stepResults = (name: string) =>
	screen.queryByRole("region", { name: `「${name}」各步骤的实际结果` });

describe("报告中的失败和阻塞用例：执行结果", () => {
	it("lists failed and blocked cases, and shows the result of each case", () => {
		renderCard();
		expect(screen.getByText("失败和阻塞的用例（3）")).toBeTruthy();
		for (const [name, result] of [
			[CHECKOUT_ROW, "失败"],
			[REFUND_ROW, "失败"],
			[SANDBOX_ROW, "阻塞"],
		] as const) {
			expect(
				within(screen.getByRole("row", { name })).getByText(result)
			).toBeTruthy();
		}
	});

	it("says that no case failed or was blocked, and that this does not mean all passed", () => {
		renderCard([], {
			...COUNTS,
			blocked: 0,
			failed: 0,
			passed: 2,
			total: 3,
			untested: 1,
		});
		expect(
			screen.getByText(
				"没有失败或阻塞的用例。这不等于全部通过：共 3 条，其中通过 2 条、未测 1 条、跳过 0 条。"
			)
		).toBeTruthy();
	});
});

describe("报告中的失败和阻塞用例：每个步骤的实际结果", () => {
	it("shows the actual result text and actual attachments of each step that has an actual result", () => {
		renderCard();
		const region = within(stepResults("下单支付") as HTMLElement);
		expect(
			region
				.getAllByRole("listitem", { name: STEP_ITEM })
				.map((item) => item.getAttribute("aria-label"))
		).toEqual(["第 2 步", "第 3 步"]);
		expect(region.getByText("页面白屏")).toBeTruthy();
		expect(region.getByText("点击支付")).toBeTruthy();
		expect(region.queryByText("打开购物车")).toBeNull();
		expect(
			region
				.getAllByRole("button", { name: THUMB })
				.map((button) => button.getAttribute("aria-label"))
		).toEqual(["查看白屏.file", "查看录屏.file"]);
	});

	it("plays a recording in the lightbox", () => {
		renderCard();
		fireEvent.click(screen.getByRole("button", { name: "查看录屏.file" }));
		const dialog = screen.getByRole("dialog");
		expect(
			within(dialog).getByRole("heading", { name: "第 3 步 · 实际附件 1/1" })
		).toBeTruthy();
		expect(dialog.querySelector("video[controls]")).not.toBeNull();
	});

	it("shows the actual result and actual attachments of a blocked case in the same way", () => {
		renderCard();
		const region = within(stepResults("沙箱支付") as HTMLElement);
		expect(region.getByText("沙箱账号没开通")).toBeTruthy();
		expect(
			region.getByRole("button", { name: "查看沙箱报错.file" })
		).toBeTruthy();
	});

	it("shows no step area for a case without actual results", () => {
		renderCard();
		expect(stepResults("退款")).toBeNull();
	});
});

describe("报告中的失败和阻塞用例：整条用例的附件照常显示", () => {
	it("counts the attachments of the whole case and of deleted steps, and lists them", () => {
		renderCard();
		const button = screen.getByRole("button", {
			name: "查看「下单支付」的 2 个附件",
		});
		fireEvent.click(button);
		expect(screen.getByRole("link", { name: "自动化.file" })).toBeTruthy();
		expect(screen.getByRole("link", { name: "已删除步骤.file" })).toBeTruthy();
		expect(screen.queryByRole("link", { name: "白屏.file" })).toBeNull();
	});

	it("shows 无 when the case has no attachments of the whole case", () => {
		renderCard();
		const row = screen.getByRole("row", { name: REFUND_ROW });
		expect(within(row).getByText("无")).toBeTruthy();
	});
});
