import type { CaseSnapshot } from "@automationstack/db/schema/test-cases";
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { formatDateTime } from "@/components/cases/case-meta";
import { VersionHistoryPanel } from "@/components/versions/version-history-panel";
import { renderWithQuery } from "@/test-dom-fixtures";

const CASE_ID = "c1";
const NEW_VERSION_PATTERN = /回滚会用 v1 的内容产生一个新版本/;
const ROLLBACK_PATTERN = /回滚/;
const EMPTY_HINT = /点击「编辑」/;

interface VersionSummary {
	changeNote: string | null;
	createdAt: Date;
	savedBy: string | null;
	version: number;
}

const SAVED_AT = new Date("2026-03-01T08:30:00Z");

const ROWS: VersionSummary[] = [
	{ changeNote: null, createdAt: SAVED_AT, savedBy: "李四", version: 3 },
	{ changeNote: "补充步骤", createdAt: SAVED_AT, savedBy: "张三", version: 2 },
	{ changeNote: null, createdAt: SAVED_AT, savedBy: null, version: 1 },
];

const SNAPSHOT: CaseSnapshot = {
	caseType: "functional",
	maintainer: "alice",
	moduleId: "11111111-1111-4111-8111-111111111111",
	name: "登录成功",
	preconditions: null,
	priority: "P1",
	sourceRef: null,
	status: "active",
	steps: [],
	tags: [],
};

const api = vi.hoisted(() => ({
	listVersions: vi.fn<() => Promise<unknown>>(),
	rollback: vi.fn<(input: unknown) => Promise<unknown>>(),
}));

vi.mock("@/utils/orpc", async () => {
	const { skipToken } = await import("@tanstack/react-query");
	return {
		orpc: {
			caseAttachments: {
				list: {
					queryOptions: () => ({
						queryFn: () => Promise.resolve([]),
						queryKey: ["caseAttachments", "list"],
					}),
				},
			},
			cases: {
				get: { key: () => ["cases", "get"] },
				getVersion: {
					queryOptions: ({ input }: { input: unknown }) => ({
						queryFn:
							input === skipToken
								? skipToken
								: () =>
										Promise.resolve({
											changeNote: null,
											createdAt: SAVED_AT,
											savedBy: "李四",
											snapshot: SNAPSHOT,
											version: (input as { version: number }).version,
										}),
						queryKey: ["cases", "getVersion", input],
					}),
				},
				list: { key: () => ["cases", "list"] },
				listVersions: {
					key: () => ["cases", "listVersions"],
					queryOptions: () => ({
						queryFn: api.listVersions,
						queryKey: ["cases", "listVersions"],
						retry: false,
					}),
				},
				rollback: {
					mutationOptions: (options: object) => ({
						...options,
						mutationFn: api.rollback,
					}),
				},
			},
		},
	};
});

function renderPanel() {
	renderWithQuery(<VersionHistoryPanel caseId={CASE_ID} currentVersion={3} />);
}

beforeEach(() => {
	api.listVersions.mockReset();
	api.rollback.mockReset();
	api.listVersions.mockResolvedValue(ROWS);
	api.rollback.mockResolvedValue({ testCase: {}, version: null });
});

async function findVersionList(): Promise<HTMLElement> {
	return await screen.findByRole("list", { name: "版本列表" });
}

describe("VersionHistoryPanel：版本列表", () => {
	it("每个版本显示等宽字体的版本号、修改人和时间；没有记录修改人时显示「未知」", async () => {
		renderPanel();
		const items = within(await findVersionList()).getAllByRole("listitem");
		expect(items).toHaveLength(3);
		const second = within(items[1]);
		expect(second.getByText("v2").className).toContain("numeric");
		expect(second.getByText("张三")).toBeDefined();
		expect(second.getByText(formatDateTime(SAVED_AT))).toBeDefined();
		expect(second.getByText("补充步骤")).toBeDefined();
		expect(within(items[2]).getByText("未知")).toBeDefined();
	});

	it("当前版本有标记，没有回滚按钮", async () => {
		renderPanel();
		const items = within(await findVersionList()).getAllByRole("listitem");
		expect(within(items[0]).getByText("当前")).toBeDefined();
		expect(
			within(items[0]).queryAllByRole("button", { name: ROLLBACK_PATTERN })
		).toEqual([]);
		expect(
			within(items[2]).getByRole("button", { name: "回滚到 v1" })
		).toBeDefined();
	});

	it("没有选择版本时对比当前版本和上一个版本（冲突提示的「查看对方的修改」依赖这一点）", async () => {
		renderPanel();
		const items = within(await findVersionList()).getAllByRole("listitem");
		expect(within(items[0]).getByText("对比")).toBeDefined();
		expect(within(items[1]).getByText("基准")).toBeDefined();
		expect(await screen.findByText("两个版本的内容相同。")).toBeDefined();
	});

	it("可以用键盘选择版本，选中的版本有 aria-pressed", async () => {
		renderPanel();
		await findVersionList();
		const select = screen.getByRole("button", { name: "选择 v1 查看或对比" });
		expect(select.getAttribute("aria-pressed")).toBe("false");
		fireEvent.click(select);
		expect(select.getAttribute("aria-pressed")).toBe("true");
	});
});

describe("VersionHistoryPanel：空状态和出错", () => {
	it("没有历史版本时显示空状态和下一步的指引", async () => {
		api.listVersions.mockResolvedValue([]);
		renderPanel();
		expect(await screen.findByText("还没有版本")).toBeDefined();
		expect(screen.getByText(EMPTY_HINT)).toBeDefined();
	});

	it("加载失败时显示原因，可以重试", async () => {
		api.listVersions.mockRejectedValueOnce(new Error("网络错误"));
		renderPanel();
		expect(await screen.findByText("版本历史加载失败")).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "重试" }));
		expect(await findVersionList()).toBeDefined();
		expect(api.listVersions).toHaveBeenCalledTimes(2);
	});
});

describe("VersionHistoryPanel：回滚", () => {
	it("回滚对话框说明回滚会产生一个新版本，确认后提交回滚", async () => {
		renderPanel();
		await findVersionList();
		fireEvent.click(screen.getByRole("button", { name: "回滚到 v1" }));
		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toMatch(NEW_VERSION_PATTERN);
		fireEvent.click(within(dialog).getByRole("button", { name: "确认回滚" }));
		await vi.waitFor(() => {
			expect(api.rollback).toHaveBeenCalled();
		});
		expect(api.rollback.mock.calls[0]?.[0]).toEqual({
			caseId: CASE_ID,
			version: 1,
		});
	});
});
