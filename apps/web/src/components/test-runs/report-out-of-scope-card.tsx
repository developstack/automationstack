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
import { useAddRunCases } from "@/components/test-runs/use-test-run-mutations";

interface OutOfScopeRowProps {
	item: ReportOutOfScopeCase;
	/** 已提交的报告锁死（D15），这时只列事实、不给追加入口。 */
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
			{/*
			 * 脚本用的那个标识。对不上的时候，人要回代码里查的就是它，
			 * 所以哪怕是空也得说清楚是「用例上没填」而不是「这里没显示」。
			 */}
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

/**
 * 表格下面那一行。已锁定时它是一句解释——这几条为什么还留在报告里；
 * 未锁定时它是「顺手把别的也挑了」的入口，外加一句「追加之后会发生什么」，
 * 免得有人点完才发现测试任务从「已完成」退回了「测试中」。
 */
function OutOfScopeFooter({
	locked,
	onPick,
}: {
	locked: boolean;
	onPick: () => void;
}) {
	if (locked) {
		return (
			<p className="text-muted-foreground text-sm">
				报告已提交并锁定，不能再追加用例。这几条留在这里是为了让读报告的人知道：这一轮脚本报的结论有一部分没进任何任务。
			</p>
		);
	}
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button onClick={onPick} size="sm" type="button" variant="ghost">
				从用例库挑选…
			</Button>
			<span className="text-muted-foreground text-xs">
				追加进来的用例结论是「未测」，测试任务会退回「测试中」。
			</span>
		</div>
	);
}

interface ReportOutOfScopeCardProps {
	cases: readonly ReportOutOfScopeCase[];
	className?: string;
	/** 已提交则整块只读：追加是写操作，后端也会在事务里拒掉。 */
	locked: boolean;
	projectId: string;
	runId: string;
}

/**
 * 越界用例：脚本报了结论、当时却不在任何未提交任务里的那几条（§5.1.1 的 `outOfScope`）。
 *
 * ## 为什么这一块只有按钮，没有任何自动追加
 *
 * §9 明写「越界用例**不会被自动追加**进测试任务」。平台只负责把事实摆出来
 * ——「你的脚本报了这几条，谁都没收」——收不收是人的判断：那可能是本迭代
 * 故意不测的模块，也可能是挑用例时漏了。自动追加会让一次跑错配置的脚本
 * 把一堆用例塞进别人的测试任务，而且**分母会跟着变**，通过率当场被改写。
 * 所以这里唯一的入口是人点一下，追加走的还是既有的 `addCases`
 * （与「追加用例」抽屉同一个 mutation，行为、事件流水、状态回退全都一致）。
 *
 * 一条越界用例都没有时整块不渲染：那是常态，空卡只是噪声。
 */
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
					<OutOfScopeFooter locked={locked} onPick={openPicker} />
				</CardContent>
			</Card>
			{/*
			 * 上面那几个按钮是「就这一条，追加」；这里是「顺手把别的也挑了」——
			 * 复用「追加用例」抽屉，不另写一份选择器（理由见该文件头）。
			 */}
			<AddRunCasesSheet
				onClose={closePicker}
				open={picking}
				projectId={projectId}
				runId={runId}
			/>
		</>
	);
}
