/**
 * 测试任务列表表格（plan §7.1）。
 *
 * 三条列设计上的硬约束：
 * - **进度用「34/120」这个分数本身承载信息**，而不是一根进度条。仓库的
 *   packages/ui 里没有 progress 组件，本轮又不允许新增；更重要的是，
 *   「还剩 86 条」这个绝对数才是决定今天还要不要加班的那个数，
 *   一根 28% 的条读不出它。
 * - **通过率的分母不含阻塞与跳过**，且分母为 0 时显示「—」而不是「0%」。
 *   口径与实现见 `test-run-rates.ts`。
 * - **状态列不承担「过没过」**：已完成只表示「都测完了」，
 *   一个挂了 40 条的测试任务同样是已完成。要看质量得读右边的通过率列。
 */
import type { TestRunListItem } from "@automationstack/db/repositories/test-runs-repository";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import { cn } from "@automationstack/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import { formatDateTime } from "@/components/cases/case-meta";
import {
	formatPassRate,
	testRunProgress,
} from "@/components/test-runs/test-run-rates";
import { TestRunRowActions } from "@/components/test-runs/test-run-row-actions";
import { TestRunStatusBadge } from "@/components/test-runs/test-run-status-badge";

/*
 * 与 case-table.tsx 同一条约定：内容长度有上界的列（枚举、定长数字、日期）
 * 直接钉宽，翻页时列不会整排横向挪动；任务名与创建人是自由文本，留空吃剩余宽度。
 */
const COLUMNS = [
	{ label: "测试任务", width: "" },
	{ label: "状态", width: "w-24" },
	{ label: "进度", width: "w-24" },
	{ label: "通过率", width: "w-20" },
	{ label: "创建人", width: "" },
	{ label: "创建时间", width: "w-28" },
	{ label: "操作", width: "w-12" },
] as const;

/** 数字列统一 tabular-nums：比例数字下每行宽度不同，竖着扫会看成锯齿。 */
const NUM_CLASS = "whitespace-nowrap tabular-nums";

/**
 * 创建人为空时的占位。与通过率那一列的 `RATE_UNKNOWN` 是同一个字符但不是同一件事
 * （那边说「分母为 0，算不出来」，这里说「这条没有署名」），所以不共用常量。
 */
const CREATOR_UNKNOWN = "—";

function ProgressCell({ item }: { item: TestRunListItem }) {
	const progress = testRunProgress(item.counts);
	const finished = progress.total > 0 && progress.done === progress.total;

	return (
		<TableCell className={NUM_CLASS}>
			{/*
			 * 分数是给人读的那份信息；旁边那根细条只是让一眼扫下来能看出快慢，
			 * 所以 aria-hidden，不再重复播报一遍。宽度用 CSS 变量而不是行内
			 * style 的 width：仓库里没有任何行内样式，保持一致。
			 */}
			<span className={cn(finished ? "font-medium" : undefined)}>
				{progress.done}/{progress.total}
			</span>
		</TableCell>
	);
}

interface TestRunRowProps {
	item: TestRunListItem;
	onEdit: (runId: string) => void;
}

function TestRunRow({ item, onEdit }: TestRunRowProps) {
	const { run } = item;

	return (
		<TableRow>
			<TableCell>
				{/*
				 * 任务名是链接不是按钮：详情页有真实 URL（W6 的 test-runs/$runId），
				 * 做成按钮就没法中键新开、右键复制链接，读屏也会播成「按钮」。
				 */}
				<Link
					className="text-left font-medium hover:underline"
					params={{ projectId: run.projectId, runId: run.id }}
					to="/projects/$projectId/test-runs/$runId"
				>
					{run.name}
				</Link>
			</TableCell>
			<TableCell>
				<TestRunStatusBadge status={run.status} />
			</TableCell>
			<ProgressCell item={item} />
			<TableCell className={NUM_CLASS}>{formatPassRate(item.counts)}</TableCell>
			{/*
			 * 这一列是**创建人**，不是「负责人」。运行级的负责人在数据模型里
			 * 压根不存在：`assigneeId` 长在 `test_run_cases` 上（逐条用例指派），
			 * `test_runs` 上只有 `createdBy`。以前那个「负责人」表头恒显示「—」，
			 * 看着像后端缺字段，其实是这一列问错了问题。
			 *
			 * 名字由后端在列表查询里 LEFT JOIN 出来（`createdByName`），前端不拿
			 * uuid 去换名字——`users.list` 是 adminProcedure，普通成员调不动。
			 * 为 null 的两种成因（没有创建人 / 账号已被删）都只影响署名，
			 * 显示「—」即可，不必区分。
			 */}
			<TableCell className="text-muted-foreground">
				{item.createdByName ?? CREATOR_UNKNOWN}
			</TableCell>
			<TableCell className={cn(NUM_CLASS, "text-muted-foreground")}>
				{formatDateTime(run.createdAt)}
			</TableCell>
			<TableCell>
				<TestRunRowActions item={item} onEdit={onEdit} />
			</TableCell>
		</TableRow>
	);
}

interface TestRunTableProps {
	items: TestRunListItem[];
	onEdit: (runId: string) => void;
}

export function TestRunTable({ items, onEdit }: TestRunTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					{COLUMNS.map((column) => (
						<TableHead className={column.width} key={column.label}>
							{column.label === "操作" ? (
								<span className="sr-only">操作</span>
							) : (
								column.label
							)}
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{items.map((item) => (
					<TestRunRow item={item} key={item.run.id} onEdit={onEdit} />
				))}
			</TableBody>
		</Table>
	);
}
