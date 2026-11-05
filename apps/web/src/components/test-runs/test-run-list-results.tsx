import type { TestRunListItem } from "@automationstack/db/repositories/test-runs-repository";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { ClipboardListIcon } from "lucide-react";

import {
	DEFAULT_RUN_STATUS_FILTER_LABEL,
	RUN_STATUS_LABELS,
} from "@/components/test-runs/test-run-meta";
import { TestRunTable } from "@/components/test-runs/test-run-table";
import {
	isFilteredRunSearch,
	type TestRunsSearch,
} from "@/components/test-runs/test-runs-search";

/** 列表为空的三种情况：有筛选条件、测试任务都已作废、项目还没有测试任务。 */
type EmptyKind = "filtered" | "allVoided" | "none";

const EMPTY_TEXTS: Record<EmptyKind, { hint: string; title: string }> = {
	allVoided: {
		hint: `已作废的测试任务默认不显示，在状态筛选中选「${RUN_STATUS_LABELS.voided}」查看。`,
		title: "所有测试任务都已作废",
	},
	filtered: {
		hint: `换个关键词，或把状态切回「${DEFAULT_RUN_STATUS_FILTER_LABEL}」看看。`,
		title: "没有符合条件的测试任务",
	},
	none: {
		hint: "点击右上角「新建测试任务」，挑一批用例开始这一轮测试。",
		title: "还没有测试任务",
	},
};

function TestRunEmpty({ kind }: { kind: EmptyKind }) {
	const { hint, title } = EMPTY_TEXTS[kind];
	return (
		<Empty>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<ClipboardListIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{hint}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

function emptyKind(search: TestRunsSearch, hasVoidedRuns: boolean): EmptyKind {
	if (isFilteredRunSearch(search)) {
		return "filtered";
	}
	return hasVoidedRuns ? "allVoided" : "none";
}

interface TestRunListResultsProps {
	/** 项目中有已作废的测试任务。只在不筛选、列表为空时用到。 */
	hasVoidedRuns: boolean;
	items: TestRunListItem[];
	loaded: boolean;
	onEdit: (runId: string) => void;
	search: TestRunsSearch;
}

export function TestRunListResults({
	hasVoidedRuns,
	items,
	loaded,
	onEdit,
	search,
}: TestRunListResultsProps) {
	if (!loaded) {
		return null;
	}
	if (items.length === 0) {
		return <TestRunEmpty kind={emptyKind(search, hasVoidedRuns)} />;
	}
	return <TestRunTable items={items} onEdit={onEdit} />;
}
