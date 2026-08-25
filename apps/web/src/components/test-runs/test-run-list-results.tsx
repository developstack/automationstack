/**
 * 列表页正文那一格：骨架 / 空状态 / 表格三选一。
 *
 * 三态在原先的 TestRunListView 里是三个并排的 `cond ? <X/> : null`，彼此靠
 * 「`data === undefined`」和「`items.length`」拼出互斥。改成早返回之后互斥变成
 * 结构性的——读的人不必再自己验一遍三个条件两两不重叠。渲染结果不变：
 * 原先那两个没中的分支本来就渲染 null，在 flex 列里不占位也不吃 gap。
 */
import type { TestRunListItem } from "@automationstack/db/repositories/test-runs-repository";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { ClipboardListIcon } from "lucide-react";

import { TestRunListSkeleton } from "@/components/test-runs/test-run-list-skeleton";
import { TestRunTable } from "@/components/test-runs/test-run-table";
import type { TestRunsSearch } from "@/components/test-runs/test-runs-search";

/**
 * 空状态要说清「为什么空」：有筛选时问题多半出在筛选条件上，
 * 而一句笼统的「还没有测试任务」会让人以为数据没了。
 */
function TestRunEmpty({ filtered }: { filtered: boolean }) {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<ClipboardListIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>
					{filtered ? "没有符合条件的测试任务" : "还没有测试任务"}
				</EmptyTitle>
				<EmptyDescription>
					{filtered
						? "换个关键词，或把状态切回「全部状态」看看。"
						: "点击右上角「新建测试任务」，挑一批用例开始这一轮测试。"}
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

interface TestRunListResultsProps {
	items: TestRunListItem[];
	/** 列表数据到位没有；没到位一律先给骨架。 */
	loaded: boolean;
	onEdit: (runId: string) => void;
	/** 只用来判断「这个空是不是自己筛出来的」。 */
	search: TestRunsSearch;
}

export function TestRunListResults({
	items,
	loaded,
	onEdit,
	search,
}: TestRunListResultsProps) {
	if (!loaded) {
		return <TestRunListSkeleton />;
	}
	if (items.length === 0) {
		// 两个筛选任意一个还挂着，这个「空」就是筛出来的，不是真的没数据。
		return (
			<TestRunEmpty
				filtered={
					search.runStatus !== undefined || search.runKeyword !== undefined
				}
			/>
		);
	}
	return <TestRunTable items={items} onEdit={onEdit} />;
}
