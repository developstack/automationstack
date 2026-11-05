import { RunCaseGroupList } from "@/components/test-runs/run-case-group-list";
import type { RunCaseRowContext } from "@/components/test-runs/run-case-rows";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";

export interface RunCaseScrollAreaProps extends RunCaseRowContext {
	cases: readonly RunCaseDetail[];
	projectId: string;
	runId: string;
	selectedModuleId: string | null;
}

/** 左栏的滚动区：有用例时按模块分组，没有用例时给一句说明。 */
export function RunCaseScrollArea(props: RunCaseScrollAreaProps) {
	if (props.cases.length === 0) {
		return (
			<div className="relative min-h-0 flex-1 overflow-y-auto pb-2">
				<p className="px-4 py-8 text-center text-muted-foreground text-sm">
					当前筛选下没有用例。
				</p>
			</div>
		);
	}
	return (
		<div className="relative min-h-0 flex-1 overflow-y-auto pb-2">
			<RunCaseGroupList {...props} />
		</div>
	);
}
