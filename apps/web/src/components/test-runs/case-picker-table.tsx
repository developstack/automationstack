/**
 * 用例选择器右栏的那张表（从 `case-picker.tsx` 拆出来，见仓库 300 行文件上限）。
 *
 * 这里只负责「把一页用例画成可勾选的行」，不碰筛选、分页与选中集的维护——
 * 那些状态全在 `CasePicker` 手里，这一层拿到什么就画什么。
 */
import type { TestCase } from "@automationstack/db/schema/test-cases";
import { Badge } from "@automationstack/ui/components/badge";
import { Checkbox } from "@automationstack/ui/components/checkbox";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import { useCallback } from "react";

import { PRIORITY_BADGE_VARIANTS } from "@/components/cases/case-meta";
import { CaseStatusBadge } from "@/components/cases/case-status-badge";

interface PickerRowProps {
	onToggle: (caseId: string) => void;
	selected: boolean;
	testCase: TestCase;
}

function PickerRow({ onToggle, selected, testCase }: PickerRowProps) {
	const handleToggle = useCallback(
		() => onToggle(testCase.id),
		[onToggle, testCase.id]
	);

	return (
		<TableRow aria-selected={selected}>
			<TableCell className="w-8">
				{/*
				 * 每个复选框都带自己的 aria-label 而不是只靠同行的名称单元格：
				 * 读屏用户逐个 tab 过复选框时，听到的只有控件自己的名字，
				 * 一串「复选框 未选中」根本分不出勾的是哪一条。
				 */}
				<Checkbox
					aria-label={`选择用例「${testCase.name}」`}
					checked={selected}
					onCheckedChange={handleToggle}
				/>
			</TableCell>
			<TableCell className="font-medium">{testCase.name}</TableCell>
			<TableCell className="w-16">
				<Badge variant={PRIORITY_BADGE_VARIANTS[testCase.priority]}>
					{testCase.priority}
				</Badge>
			</TableCell>
			<TableCell className="w-20">
				<CaseStatusBadge status={testCase.status} />
			</TableCell>
		</TableRow>
	);
}

const SKELETON_ROW_KEYS = ["r1", "r2", "r3", "r4", "r5", "r6"] as const;

export function PickerTableSkeleton() {
	return (
		<output
			aria-busy="true"
			aria-label="用例列表加载中"
			className="flex flex-col"
		>
			<Skeleton className="mb-px h-10 w-full rounded-none" />
			{SKELETON_ROW_KEYS.map((key) => (
				<Skeleton className="mt-px h-9 w-full rounded-none" key={key} />
			))}
		</output>
	);
}

interface PickerTableProps {
	cases: TestCase[];
	onToggle: (caseId: string) => void;
	onTogglePage: () => void;
	pageAllSelected: boolean;
	selectedIds: ReadonlySet<string>;
}

export function PickerTable({
	cases,
	onToggle,
	onTogglePage,
	pageAllSelected,
	selectedIds,
}: PickerTableProps) {
	if (cases.length === 0) {
		return (
			<p className="px-2 py-8 text-center text-muted-foreground text-sm">
				当前范围下没有用例，换个模块或清掉筛选条件试试。
			</p>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-8">
						<Checkbox
							aria-label="全选本页用例"
							checked={pageAllSelected}
							onCheckedChange={onTogglePage}
						/>
					</TableHead>
					<TableHead>名称</TableHead>
					<TableHead className="w-16">优先级</TableHead>
					<TableHead className="w-20">状态</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{cases.map((testCase) => (
					<PickerRow
						key={testCase.id}
						onToggle={onToggle}
						selected={selectedIds.has(testCase.id)}
						testCase={testCase}
					/>
				))}
			</TableBody>
		</Table>
	);
}
