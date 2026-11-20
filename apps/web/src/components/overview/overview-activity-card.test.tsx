import type {
	FeedCase,
	FeedEntry,
	FeedPage,
} from "@automationstack/db/repositories/project-stats-activity-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OverviewActivityCard } from "@/components/overview/overview-activity-card";
import { renderRoutes } from "@/test-dom-fixtures";

const pages = vi.hoisted(() => ({ byCursor: new Map<string, unknown>() }));

vi.mock("@/utils/orpc", () => ({
	orpc: {
		projectStats: {
			activityFeed: {
				infiniteOptions: (options: {
					getNextPageParam: (page: unknown) => unknown;
					initialPageParam: unknown;
					input: (cursor: string | undefined) => unknown;
				}) => ({
					...options,
					queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
						Promise.resolve(pages.byCursor.get(pageParam ?? "first")),
					queryKey: ["projectStats", "activityFeed"],
				}),
			},
		},
	},
}));

const AT = new Date();

function feedCase(id: string, overrides: Partial<FeedCase> = {}): FeedCase {
	return {
		caseId: id,
		caseName: `用例 ${id}`,
		changeNote: null,
		exists: true,
		moduleId: "m1",
		moduleName: "登录",
		version: 2,
		...overrides,
	};
}

function entry(cursor: string, fields: Partial<FeedEntry>): FeedEntry {
	return {
		action: "updated",
		actorName: "alice",
		at: AT,
		caseCount: 1,
		cases: [],
		cursor,
		...fields,
	};
}

const FIRST_PAGE: FeedPage = {
	entries: [
		entry("e1", { cases: [feedCase("c1", { changeNote: "补充步骤" })] }),
		entry("e2", {
			action: "deleted",
			cases: [feedCase("c2", { exists: false })],
		}),
		entry("e3", {
			action: "deleted",
			actorName: "bob",
			caseCount: 5,
			cases: [feedCase("c3"), feedCase("c4"), feedCase("c5")],
		}),
	],
	nextCursor: "e3",
};

const SECOND_PAGE: FeedPage = {
	entries: [entry("e4", { cases: [feedCase("c6")] })],
	nextCursor: null,
};

function renderCard() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	renderRoutes({
		initialPath: "/projects/p1",
		routes: {
			"/projects/$projectId": () => (
				<QueryClientProvider client={queryClient}>
					<OverviewActivityCard projectId="p1" />
				</QueryClientProvider>
			),
		},
	});
}

describe("OverviewActivityCard", () => {
	beforeEach(() => {
		pages.byCursor.clear();
		pages.byCursor.set("first", FIRST_PAGE);
		pages.byCursor.set("e3", SECOND_PAGE);
	});

	it("显示日志：存在的用例是链接，已删除的用例没有链接，批量操作可以展开", async () => {
		renderCard();

		const link = await screen.findByRole("link", { name: "用例 c1" });
		expect(link.getAttribute("href")).toContain("caseId=c1");
		expect(screen.getByText("登录 · v1 → v2 · 补充步骤")).toBeDefined();
		expect(screen.getByText("用例 c2（已删除）")).toBeDefined();
		expect(
			screen.queryByRole("link", { name: "用例 c2（已删除）" })
		).toBeNull();
		expect(screen.getByText("删除了 5 条用例", { exact: false })).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: "查看用例" }));
		expect(await screen.findByText("用例 c4")).toBeDefined();
		expect(screen.getByText("还有 2 条没有列出")).toBeDefined();
	});

	it("点击「加载更早的记录」追加下一页，没有更早的记录时按钮消失", async () => {
		renderCard();

		fireEvent.click(
			await screen.findByRole("button", { name: "加载更早的记录" })
		);

		expect(await screen.findByRole("link", { name: "用例 c6" })).toBeDefined();
		expect(screen.getByRole("link", { name: "用例 c1" })).toBeDefined();
		expect(screen.queryByRole("button", { name: "加载更早的记录" })).toBeNull();
	});

	it("没有记录时显示提示", async () => {
		pages.byCursor.set("first", { entries: [], nextCursor: null });
		renderCard();

		expect(
			await screen.findByText("还没有修改或删除用例的记录。")
		).toBeDefined();
	});
});
