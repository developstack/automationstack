/**
 * 执行台左栏清单里的一行。
 *
 * 行是**按钮**而不是链接：选中哪条用例只改右栏内容，不换页；做成 `<a>` 会让
 * 中键点击开出一个功能不全的新标签页。当前选中条用 `aria-current="true"` 标注，
 * 读屏才念得出「我停在第几条」。
 *
 * 从 `run-case-list.tsx` 拆出来（那份文件超了仓库 300 行的上限）。按「一屏里
 * 各管一段」切：这里只管一行怎么画，不知道筛选、批量勾选那些事。
 */
import { Badge } from "@automationstack/ui/components/badge";
import { Checkbox } from "@automationstack/ui/components/checkbox";
import { cn } from "@automationstack/ui/lib/utils";
import { UserIcon } from "lucide-react";
import { useCallback } from "react";

import { CaseCollaboratorsCell } from "@/components/cases/case-collaborators-cell";
import { PRIORITY_BADGE_VARIANTS } from "@/components/cases/case-meta";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import {
	RESULT_ICONS,
	RESULT_LABELS,
	RESULT_TEXT_CLASSES,
} from "@/components/test-runs/test-run-meta";
import type { CaseCollaborators } from "@/realtime/use-editing";

export interface RunCaseRowProps {
	checked: boolean;
	/** 该用例上的其他协作者；绝大多数行是 undefined，那是正常情况。 */
	collaborators: CaseCollaborators | undefined;
	item: RunCaseDetail;
	onSelect: (runCaseId: string) => void;
	onToggleChecked: (runCaseId: string) => void;
	selectable: boolean;
	selected: boolean;
}

export function RunCaseRow({
	checked,
	collaborators,
	item,
	onSelect,
	onToggleChecked,
	selectable,
	selected,
}: RunCaseRowProps) {
	const { runCase, testCase } = item;
	const handleSelect = useCallback(
		() => onSelect(runCase.id),
		[onSelect, runCase.id]
	);
	const handleToggle = useCallback(
		() => onToggleChecked(runCase.id),
		[onToggleChecked, runCase.id]
	);
	const Icon = RESULT_ICONS[runCase.result];

	return (
		<li className="flex items-center gap-2 px-2">
			{selectable ? (
				<Checkbox
					aria-label={`选择用例 ${testCase.name}`}
					checked={checked}
					onCheckedChange={handleToggle}
				/>
			) : null}
			<button
				aria-current={selected ? "true" : undefined}
				className={cn(
					"flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
					selected && "bg-accent"
				)}
				onClick={handleSelect}
				type="button"
			>
				{/* 结论靠图标形状区分，紧跟一段 sr-only 文字，颜色不单独承担信息 */}
				<Icon
					aria-hidden="true"
					className={cn("size-4 shrink-0", RESULT_TEXT_CLASSES[runCase.result])}
				/>
				<span className="sr-only">{RESULT_LABELS[runCase.result]}</span>
				<span className="min-w-0 flex-1 truncate">{testCase.name}</span>
				<Badge variant={PRIORITY_BADGE_VARIANTS[testCase.priority]}>
					{testCase.priority}
				</Badge>
				{runCase.assigneeId !== null && (
					<UserIcon
						aria-hidden="true"
						className="size-3 text-muted-foreground"
					/>
				)}
			</button>
			{collaborators ? (
				<CaseCollaboratorsCell collaborators={collaborators} />
			) : null}
		</li>
	);
}
