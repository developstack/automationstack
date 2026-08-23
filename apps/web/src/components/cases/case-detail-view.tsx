import type { TestCase } from "@automationstack/db/schema/test-cases";
import { Badge } from "@automationstack/ui/components/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";

import {
	CASE_TYPE_LABELS,
	formatDateTime,
	PRIORITY_BADGE_VARIANTS,
} from "@/components/cases/case-meta";
import { CaseStatusBadge } from "@/components/cases/case-status-badge";

function DetailRow({ children, label }: { children: string; label: string }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="text-sm">{children}</span>
		</div>
	);
}

function CaseStepsTable({ testCase }: { testCase: TestCase }) {
	if (testCase.steps.length === 0) {
		return <p className="text-muted-foreground text-sm">暂无步骤。</p>;
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>#</TableHead>
					<TableHead>操作步骤</TableHead>
					<TableHead>预期结果</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{testCase.steps.map((step, index) => (
					<TableRow key={step.id}>
						<TableCell className="text-muted-foreground">{index + 1}</TableCell>
						<TableCell className="whitespace-pre-wrap">{step.step}</TableCell>
						<TableCell className="whitespace-pre-wrap">
							{step.expected}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

/** Read-only rendering of a saved case. */
export function CaseDetailView({ testCase }: { testCase: TestCase }) {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant={PRIORITY_BADGE_VARIANTS[testCase.priority]}>
					{testCase.priority}
				</Badge>
				<CaseStatusBadge status={testCase.status} />
				<Badge variant="outline">{CASE_TYPE_LABELS[testCase.caseType]}</Badge>
				{testCase.tags.map((tag) => (
					<Badge key={tag} variant="secondary">
						{tag}
					</Badge>
				))}
			</div>
			{/* 窄屏（抽屉只有 3/4 视口宽）三栏会把「2025/8/20 14:03」挤到换行，改为堆叠 */}
			<div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-3">
				<DetailRow label="维护人">{testCase.maintainer ?? "—"}</DetailRow>
				<DetailRow label="当前版本">{`v${testCase.currentVersion}`}</DetailRow>
				<DetailRow label="更新时间">
					{formatDateTime(testCase.updatedAt)}
				</DetailRow>
			</div>
			<DetailRow label="前置条件">{testCase.preconditions ?? "—"}</DetailRow>
			<CaseStepsTable testCase={testCase} />
		</div>
	);
}
