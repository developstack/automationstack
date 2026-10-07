import { Badge } from "@automationstack/ui/components/badge";
import { Button } from "@automationstack/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import { useCallback, useState } from "react";

import { PRIORITY_BADGE_VARIANTS } from "@/components/cases/case-meta";
import { AddRunCasesSheet } from "@/components/test-runs/add-run-cases-sheet";
import type { ReportOutOfScopeCase } from "@/components/test-runs/report-automation-meta";
import { ReportOutOfScopeFooter } from "@/components/test-runs/report-out-of-scope-footer";
import { useAddRunCases } from "@/components/test-runs/use-test-run-mutations";

interface OutOfScopeRowProps {
	item: ReportOutOfScopeCase;
	locked: boolean;
	onAppend: (caseId: string) => void;
	pending: boolean;
}

function OutOfScopeRow({
	item,
	locked,
	onAppend,
	pending,
}: OutOfScopeRowProps) {
	const handleClick = useCallback(
		() => onAppend(item.caseId),
		[item.caseId, onAppend]
	);
	return (
		<TableRow>
			<TableCell className="font-medium">{item.name}</TableCell>
			<TableCell>{item.moduleName}</TableCell>
			<TableCell>
				<Badge variant={PRIORITY_BADGE_VARIANTS[item.priority]}>
					{item.priority}
				</Badge>
			</TableCell>
			<TableCell className="font-mono text-xs">
				{item.sourceRef ?? (
					<span className="font-sans text-muted-foreground">用例上未填</span>
				)}
			</TableCell>
			<TableCell className="text-right">
				{locked ? null : (
					<Button
						disabled={pending}
						onClick={handleClick}
						size="sm"
						type="button"
						variant="outline"
					>
						追加到本任务
					</Button>
				)}
			</TableCell>
		</TableRow>
	);
}

interface OutOfScopeTableProps {
	cases: readonly ReportOutOfScopeCase[];
	locked: boolean;
	onAppend: (caseId: string) => void;
	pending: boolean;
}

function OutOfScopeTable({
	cases,
	locked,
	onAppend,
	pending,
}: OutOfScopeTableProps) {
	return (
		<div className="overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>用例名</TableHead>
						<TableHead>模块</TableHead>
						<TableHead>优先级</TableHead>
						<TableHead>脚本标识</TableHead>
						<TableHead className="text-right">操作</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{cases.map((item) => (
						<OutOfScopeRow
							item={item}
							key={item.caseId}
							locked={locked}
							onAppend={onAppend}
							pending={pending}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

interface ReportOutOfScopeCardProps {
	cases: readonly ReportOutOfScopeCase[];
	className?: string;
	locked: boolean;
	projectId: string;
	runId: string;
}

export function ReportOutOfScopeCard({
	cases,
	className,
	locked,
	projectId,
	runId,
}: ReportOutOfScopeCardProps) {
	const [picking, setPicking] = useState(false);
	const closePicker = useCallback(() => setPicking(false), []);
	const openPicker = useCallback(() => setPicking(true), []);
	const add = useAddRunCases(closePicker);
	const handleAppend = useCallback(
		(caseId: string) => add.mutate({ caseIds: [caseId], runId }),
		[add, runId]
	);

	if (cases.length === 0) {
		return null;
	}

	return (
		<>
			<Card className={className}>
				<CardHeader>
					<CardTitle>{`越界用例（${cases.length}）`}</CardTitle>
					<CardDescription>
						脚本报了这几条，但上报的那一刻它们不在任何未提交的测试任务里。平台不会自动把它们追加进来——追加会改变本任务的分母，通过率会跟着变，所以这一步只能人来点。
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<OutOfScopeTable
						cases={cases}
						locked={locked}
						onAppend={handleAppend}
						pending={add.isPending}
					/>
					<ReportOutOfScopeFooter locked={locked} onPick={openPicker} />
				</CardContent>
			</Card>
			<AddRunCasesSheet
				onClose={closePicker}
				open={picking}
				projectId={projectId}
				runId={runId}
			/>
		</>
	);
}
