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
import { cn } from "@automationstack/ui/lib/utils";

import { CaseCollaboratorsCell } from "@/components/cases/case-collaborators-cell";
import {
	CASE_TYPE_LABELS,
	formatDateTime,
	PRIORITY_BADGE_VARIANTS,
} from "@/components/cases/case-meta";
import { CaseNameCell } from "@/components/cases/case-name-cell";
import { CaseStatusBadge } from "@/components/cases/case-status-badge";
import { CaseTableEmpty } from "@/components/cases/case-table-empty";
import {
	type CaseCollaborators,
	useCollaboratorsByCaseId,
} from "@/realtime/use-editing";

/*
 * 表格是 auto 布局，列宽由「当前这一页」的最长内容算出来：翻一页
 * 「兼容性」变成「功能」，优先级 / 类型 / 状态 / 更新时间这几列就整排横向挪几像素，
 * 用户以为自己看错了行。这几列的内容长度其实是有上界的（枚举值、定长日期），
 * 所以直接给一个不小于上界的宽度把它们钉住；auto 布局下 width 只是下限，
 * 万一以后有更长的内容仍会自动撑开。名称与标签是自由文本，留空吃掉剩余宽度。
 */
const COLUMNS = [
	{ label: "名称", width: "" },
	{ label: "优先级", width: "w-16" },
	{ label: "类型", width: "w-16" },
	{ label: "状态", width: "w-20" },
	{ label: "标签", width: "" },
	{ label: "维护人", width: "" },
	{ label: "更新时间", width: "w-28" },
	// 协作列同属「内容有上界」那一类：头像堆自己就限了幅（至多 3 枚 + 一枚「+N」，
	// 折算见 case-collaborators-cell.tsx 的 MAX_VISIBLE_AVATARS），钉住宽度即可
	{ label: "协作", width: "w-24" },
] as const;

function CaseTags({ tags }: { tags: string[] }) {
	if (tags.length === 0) {
		return <span className="text-muted-foreground">—</span>;
	}
	return (
		<div className="flex flex-wrap gap-1">
			{tags.map((tag) => (
				<Badge key={tag} variant="outline">
					{tag}
				</Badge>
			))}
		</div>
	);
}

interface CaseRowProps {
	/** 该用例上的其他成员（在看 / 在改）；没人时为 undefined。 */
	collaborators: CaseCollaborators | undefined;
	selected: boolean;
	testCase: TestCase;
}

/** 选中行左侧的竖条：选中不能只靠底色，色盲用户要有形状线索。 */
const ROW_MARKER = "border-l-2";

/** 行高是骨架屏的折算依据：改这里要同步 case-table-skeleton.tsx 的 CaseTableSkeleton。 */
function CaseRow({ collaborators, selected, testCase }: CaseRowProps) {
	// TableRow 基类自带 hover:bg-muted/50，选中行必须连 hover 态一起覆盖，
	// 否则鼠标一划过，「选中」就被 hover 底色盖掉、看着像丢了选中。
	return (
		<TableRow
			aria-selected={selected}
			className={cn(
				ROW_MARKER,
				selected
					? "border-l-primary bg-accent/60 hover:bg-accent"
					: "border-l-transparent"
			)}
		>
			<CaseNameCell testCase={testCase} />
			<TableCell>
				<Badge variant={PRIORITY_BADGE_VARIANTS[testCase.priority]}>
					{testCase.priority}
				</Badge>
			</TableCell>
			<TableCell>{CASE_TYPE_LABELS[testCase.caseType]}</TableCell>
			<TableCell>
				<CaseStatusBadge status={testCase.status} />
			</TableCell>
			<TableCell>
				<CaseTags tags={testCase.tags} />
			</TableCell>
			<TableCell>
				{testCase.maintainer ?? (
					<span className="text-muted-foreground">—</span>
				)}
			</TableCell>
			{/*
			 * tabular-nums：日期列是唯一的等宽数字列，比例数字下每行的
			 * 「25/8/20 14:03」宽度都不一样，斜切、月/日/时分对不齐，
			 * 竖着扫一列时间会看成锯齿。列本身沿用全表的左对齐，不单独右对齐。
			 */}
			<TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
				{formatDateTime(testCase.updatedAt)}
			</TableCell>
			<TableCell>
				<CaseCollaboratorsCell collaborators={collaborators} />
			</TableCell>
		</TableRow>
	);
}

interface CaseTableProps {
	cases: TestCase[];
	filtered: boolean;
	onClearFilters: () => void;
	selectedCaseId: string | undefined;
	/** 当前这份是上一次查询留下的旧结果；淡一档表示「还在取新的」。 */
	stale: boolean;
}

/**
 * 「这份是旧的，新的还在路上」的表达方式：淡到 60%。
 *
 * 为什么需要它：改筛选、翻页不再把整块内容换成骨架（见
 * routes/projects/$projectId/index.tsx 里 caseListLoaderDeps 的注释），
 * 上一份结果会留在屏幕上直到新结果到达。那段时间里若一点提示都没有，
 * 用户不知道筛选到底生效了没有。
 *
 * 为什么是 60% 而不是别的：这是最轻的一档「旧的」，既不遮挡阅读，也不像骨架
 * 那样把内容整个拿走。只淡不动——位移或缩放会让一张几十行的表整体晃一下，
 * 比原来的骨架还糟；transition-crossfade 只列 opacity 一个属性。
 *
 * 为什么不套一层容器统一挂：`<Empty>` 自带 flex-1，靠「直接作为 main 这个
 * flex 列的子元素」来吃满剩余高度，中间插一个普通 div 会让它塌成内容高度。
 * 两个分支各自挂在自己的根上，布局分毫不动。
 */
const STALE_CLASS = "transition-crossfade";

/** Flat case list for the current module + filter selection. */
export function CaseTable({
	cases,
	filtered,
	onClearFilters,
	selectedCaseId,
	stale,
}: CaseTableProps) {
	const collaboratorsByCaseId = useCollaboratorsByCaseId();

	if (cases.length === 0) {
		return (
			<CaseTableEmpty
				className={cn(STALE_CLASS, stale && "opacity-60")}
				filtered={filtered}
				onClearFilters={onClearFilters}
			/>
		);
	}

	return (
		<Table className={cn(STALE_CLASS, stale && "opacity-60")}>
			<TableHeader>
				<TableRow>
					{COLUMNS.map((column) => (
						<TableHead className={column.width} key={column.label}>
							{column.label}
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{cases.map((testCase) => (
					<CaseRow
						collaborators={collaboratorsByCaseId.get(testCase.id)}
						key={testCase.id}
						selected={testCase.id === selectedCaseId}
						testCase={testCase}
					/>
				))}
			</TableBody>
		</Table>
	);
}
