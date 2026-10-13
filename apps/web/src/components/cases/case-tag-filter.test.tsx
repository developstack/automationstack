import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CaseTagFilter } from "@/components/cases/case-tag-filter";

const TAGS_KEY = ["cases", "listTags"];

vi.mock("@/utils/orpc", () => ({
	orpc: {
		cases: {
			listTags: {
				queryOptions: () => ({
					queryFn: () => Promise.resolve(["登录", "支付"]),
					queryKey: TAGS_KEY,
				}),
			},
		},
	},
}));

function renderFilter(tags: string[]) {
	const onChange = vi.fn();
	const queryClient = new QueryClient();
	queryClient.setQueryData(TAGS_KEY, ["登录", "支付"]);
	render(
		<QueryClientProvider client={queryClient}>
			<CaseTagFilter onChange={onChange} projectId="p1" tags={tags} />
		</QueryClientProvider>
	);
	return { onChange };
}

describe("CaseTagFilter：按标签筛选", () => {
	it("点击「标签」按钮打开弹出层，按下一个标签后加入筛选", async () => {
		const { onChange } = renderFilter([]);
		const trigger = screen.getByRole("button", { name: "按标签筛选" });
		fireEvent.click(trigger);
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
		fireEvent.click(await screen.findByRole("button", { name: "支付" }));
		expect(onChange).toHaveBeenCalledWith(["支付"]);
	});

	it("按钮的名称说明已选几个标签", () => {
		renderFilter(["登录"]);
		expect(
			screen.getByRole("button", { name: "按标签筛选，已选 1 个" })
		).toBeDefined();
	});
});
