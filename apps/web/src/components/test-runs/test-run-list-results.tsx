import type { TestRunListItem } from "@automationstack/db/repositories/test-runs-repository";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { ClipboardListIcon } from "lucide-react";

import { TestRunTable } from "@/components/test-runs/test-run-table";
import type { TestRunsSearch } from "@/components/test-runs/test-runs-search";

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
	loaded: boolean;
	onEdit: (runId: string) => void;
	search: TestRunsSearch;
}

export function TestRunListResults({
	items,
	loaded,
	onEdit,
	search,
}: TestRunListResultsProps) {
	if (!loaded) {
		return null;
	}
	if (items.length === 0) {
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
