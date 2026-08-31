/**
 * 全站表格骨架的唯一实现。
 *
 * 合并前有六份彼此复制粘贴的副本（用例列表 / 测试任务列表 / 用例挑选器 /
 * Token 列表 / 平台用户 / 项目成员），报告页另有一份只画数据行的私有副本。
 * 它们的差别只有三处：播报名、行数、行高，以及行与行之间是靠边框（mt-px）
 * 还是靠 gap 隔开。把这三处提成参数之后，六份就是同一份。
 *
 * 形状的来源是 settings-section.tsx 那份「按字段描述符生成每格形状」的写法：
 * 调用方逐列描述真表长什么样，组件只负责把描述符画出来。给不出默认值——
 * 每张表的列宽、列名字数、单元格里内容的横向占比都不一样，一个
 * `columns: number` 只能画出「满宽、等宽」这一种形状，别的表就必然对不上。
 *
 * ⚠️ 高度是承重的，宽度不是。表头 40px + TableHeader 的 1px 下边框、数据行
 * 由 rowHeight 折算自真身，改动任何一档都等于让数据到达那一帧整页跳一下。
 * 宽度只影响横向观感，对不齐不构成位移。
 */
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { cn } from "@automationstack/ui/lib/utils";

/** 骨架里一列的形状。逐项对着真表头与真单元格填，别给默认值。 */
export interface TableSkeletonColumn {
	/**
	 * 表头灰条宽度类，按列名字数折算（text-sm 一个全角字约 14px）。
	 * 真表头是 sr-only（操作列那种）的填 w-0：那一格视觉上本来就是空的。
	 */
	head: string;
	/** 列名。既当 React key，也让这份描述符能与真表头逐条对读。 */
	label: string;
	/**
	 * 单元格灰条宽度类：该列真实内容在单元格里横向占多少。
	 * 这一档正是本次要改的东西——真内容一行字只占该行三四成的墨，
	 * 骨架却把整行铺满实色，看着比真内容还重。
	 */
	value: string;
	/**
	 * 列宽类，与真 `<TableHead className>` 逐字同源；钉宽的列要带 shrink-0，
	 * 自适应列填 flex-1。右对齐的列在这里一并写上 flex justify-end。
	 */
	width: string;
}

/**
 * 行与行之间怎么隔开。三档都来自真身，不是审美选择：
 * - bordered：表格自己的 1px 行边框（mb-px / mt-px），列表页那几张表；
 * - spaced：`grid gap-2`，平台用户与项目成员那两份原本就是这么排的；
 * - inset：`my-1`，报告页卡片里那几段。
 */
export type TableSkeletonSpacing = "bordered" | "inset" | "spaced";

const CONTAINER_CLASS: Record<TableSkeletonSpacing, string> = {
	bordered: "flex flex-col",
	inset: "flex flex-col",
	spaced: "grid gap-2",
};

const ROW_SPACING_CLASS: Record<TableSkeletonSpacing, string> = {
	bordered: "mt-px",
	inset: "my-1",
	spaced: "",
};

/** 表头灰条高度：TableHead 里那行 text-sm 的字高。 */
const HEAD_BAR_HEIGHT = "h-4";

/** 单元格灰条高度：行内最常见的内容（Badge / 一行 text-sm）就是 20px。 */
const VALUE_BAR_HEIGHT = "h-5";

/*
 * 骨架行的 key 在渲染前一次性生成，而不是在 JSX 里拿 map 的下标当 key：
 * 行数是变量，写成 key={index} 既过不了 lint，语义上也不对。
 */
function skeletonRowKeys(rows: number): string[] {
	return Array.from({ length: rows }, (_, index) => `skeleton-row-${index}`);
}

interface CellsProps {
	columns: readonly TableSkeletonColumn[];
	height: string;
	/** 取描述符里的哪一档宽度：表头那一行还是数据行。 */
	slot: "head" | "value";
}

/** 一行里的各格。px-2 与真身 TableCell / TableHead 的内边距同档。 */
function TableSkeletonCells({ columns, height, slot }: CellsProps) {
	return (
		<>
			{columns.map((column) => (
				<div className={cn("px-2", column.width)} key={column.label}>
					<Skeleton className={cn(height, column[slot])} />
				</div>
			))}
		</>
	);
}

interface TableSkeletonBodyProps {
	columns: readonly TableSkeletonColumn[];
	header: boolean;
	rowHeight: string;
	rows: number;
	spacing: TableSkeletonSpacing;
}

function TableSkeletonBody(props: TableSkeletonBodyProps) {
	return (
		<>
			{props.header ? (
				// h-10 + mb-px = TableHead 的 40px + TableHeader 的 1px 下边框
				<div className="mb-px flex h-10 items-center">
					<TableSkeletonCells
						columns={props.columns}
						height={HEAD_BAR_HEIGHT}
						slot="head"
					/>
				</div>
			) : null}
			{skeletonRowKeys(props.rows).map((key) => (
				<div
					className={cn(
						"flex items-center",
						props.rowHeight,
						ROW_SPACING_CLASS[props.spacing]
					)}
					key={key}
				>
					<TableSkeletonCells
						columns={props.columns}
						height={VALUE_BAR_HEIGHT}
						slot="value"
					/>
				</div>
			))}
		</>
	);
}

export interface TableSkeletonProps {
	columns: readonly TableSkeletonColumn[];
	/** 真表有没有 `<TableHeader>`。没有的填 false，凭空多画一行会高出 41px。 */
	header?: boolean;
	/**
	 * 读屏播报名。外层已经有别的播报区时给 undefined，整块转成 aria-hidden——
	 * 同一次加载播两遍读屏只会更吵。
	 */
	label?: string;
	/** 数据行高度类，折算自真身行高（默认 h-9 = TableCell 的 p-2 + 20px 内容）。 */
	rowHeight?: string;
	rows: number;
	spacing?: TableSkeletonSpacing;
}

export function TableSkeleton({
	columns,
	header = true,
	label,
	rowHeight = "h-9",
	rows,
	spacing = "bordered",
}: TableSkeletonProps) {
	const body = (
		<TableSkeletonBody
			columns={columns}
			header={header}
			rowHeight={rowHeight}
			rows={rows}
			spacing={spacing}
		/>
	);
	if (label === undefined) {
		return (
			<div aria-hidden="true" className={CONTAINER_CLASS[spacing]}>
				{body}
			</div>
		);
	}
	return (
		<output
			aria-busy="true"
			aria-label={label}
			className={CONTAINER_CLASS[spacing]}
		>
			{body}
		</output>
	);
}
