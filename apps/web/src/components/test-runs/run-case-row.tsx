/**
 * 执行台左栏清单里的一行。
 *
 * 行是**按钮**而不是链接：选中哪条用例只改右栏内容，不换页；做成 `<a>` 会让
 * 中键点击开出一个功能不全的新标签页。当前选中条用 `aria-current="true"` 标注，
 * 读屏才念得出「我停在第几条」。
 *
 * 从 `run-case-list.tsx` 拆出来（那份文件超了仓库 300 行的上限）。按「一屏里
 * 各管一段」切：这里只管一行怎么画，不知道筛选、批量勾选那些事。
 *
 * 行内部又分成两截：`<li>` 这一层管「一行由哪几块拼成」（勾选框、正文按钮、
 * 协作者头像），`RunCaseRowContent` 管按钮里那一串信息怎么排。分开是为了让
 * `RunCaseRow` 回到 eslint 的 50 行函数上限之内；切口选在 `<button>` 边界，
 * 因为那一整块正好只依赖 `item` 与 `selected`，不碰勾选那条线。
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

/**
 * 行正文那颗按钮。
 *
 * 定义在模块顶层而不是 `RunCaseRow` 内部：写在组件内部的话，父组件每次重渲染
 * 都会生成一个新的组件类型，React 认不出是同一个，会把整棵子树卸载重建
 * （焦点、选区全丢）——清单里几百行同时这么做，代价尤其明显。
 */
function RunCaseRowContent({
	item,
	onSelect,
	selected,
}: {
	item: RunCaseDetail;
	onSelect: () => void;
	selected: boolean;
}) {
	const { runCase, testCase } = item;
	const Icon = RESULT_ICONS[runCase.result];

	return (
		<button
			aria-current={selected ? "true" : undefined}
			className={cn(
				"flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
				selected && "bg-accent"
			)}
			onClick={onSelect}
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
				<UserIcon aria-hidden="true" className="size-3 text-muted-foreground" />
			)}
		</button>
	);
}

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

	return (
		<li className="flex items-center gap-2 px-2">
			{selectable ? (
				<Checkbox
					aria-label={`选择用例 ${testCase.name}`}
					checked={checked}
					onCheckedChange={handleToggle}
				/>
			) : null}
			<RunCaseRowContent
				item={item}
				onSelect={handleSelect}
				selected={selected}
			/>
			{collaborators ? (
				<CaseCollaboratorsCell collaborators={collaborators} />
			) : null}
		</li>
	);
}
