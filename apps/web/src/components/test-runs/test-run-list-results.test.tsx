import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { TestRunListResults } from "@/components/test-runs/test-run-list-results";
import type { TestRunsSearch } from "@/components/test-runs/test-runs-search";

interface EmptyRow {
	hasVoidedRuns: boolean;
	hint: string;
	name: string;
	search: TestRunsSearch;
	title: string;
}

it.each<EmptyRow>([
	{
		hasVoidedRuns: false,
		hint: "点击右上角「新建测试任务」，挑一批用例开始这一轮测试。",
		name: "项目没有测试任务",
		search: {},
		title: "还没有测试任务",
	},
	{
		hasVoidedRuns: true,
		hint: "已作废的测试任务默认不显示，在状态筛选中选「已作废」查看。",
		name: "项目的测试任务都已作废",
		search: {},
		title: "所有测试任务都已作废",
	},
	{
		hasVoidedRuns: true,
		hint: "换个关键词，或把状态切回「全部（不含已作废）」看看。",
		name: "有筛选条件",
		search: { runKeyword: "登录" },
		title: "没有符合条件的测试任务",
	},
])(
	"列表为空，$name：显示对应的说明",
	({ hasVoidedRuns, hint, search, title }) => {
		render(
			<TestRunListResults
				hasVoidedRuns={hasVoidedRuns}
				items={[]}
				loaded
				onEdit={vi.fn()}
				search={search}
			/>
		);
		expect(screen.getByText(title)).not.toBeNull();
		expect(screen.getByText(hint)).not.toBeNull();
	}
);
