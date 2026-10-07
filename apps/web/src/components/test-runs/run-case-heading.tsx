import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { Link } from "@tanstack/react-router";

import { RunCaseHeaderActions } from "@/components/test-runs/run-case-header-actions";
import { RunCaseResultBadge } from "@/components/test-runs/run-case-result-badge";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { RUN_SECTION_TEXT } from "@/components/test-runs/run-panel-typography";

type RunTestCase = RunCaseDetail["testCase"];

function HeadingResultBadge({ result }: { result: TestRunCaseResult }) {
	if (result === "untested") {
		return null;
	}
	return <RunCaseResultBadge result={result} />;
}

function RunCaseMetaLine({ testCase }: { testCase: RunTestCase }) {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1">
			<span className={RUN_SECTION_TEXT}>模块：{testCase.moduleName}</span>
			<span className={RUN_SECTION_TEXT}>
				维护人：{testCase.maintainer ?? "—"}
			</span>
		</div>
	);
}

export interface RunCaseHeadingProps {
	canConclude: boolean;
	editing: boolean;
	onEdit: (() => void) | null;
	onReset: () => void;
	projectId: string;
	runCase: RunCaseDetail["runCase"];
	testCase: RunTestCase;
}

export function RunCaseHeading({
	canConclude,
	editing,
	onEdit,
	onReset,
	projectId,
	runCase,
	testCase,
}: RunCaseHeadingProps) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<h2 className="min-w-0 break-words font-medium text-base">
						{testCase.name}
					</h2>
					<HeadingResultBadge result={runCase.result} />
					<Link
						className="shrink-0 text-sm underline-offset-4 hover:underline"
						params={{ projectId }}
						search={{ caseId: testCase.id, moduleId: testCase.moduleId }}
						to="/projects/$projectId"
					>
						详情
					</Link>
				</div>
				<RunCaseHeaderActions
					canConclude={canConclude}
					editing={editing}
					onEdit={onEdit}
					onReset={onReset}
					runCase={runCase}
				/>
			</div>
			<RunCaseMetaLine testCase={testCase} />
		</div>
	);
}
