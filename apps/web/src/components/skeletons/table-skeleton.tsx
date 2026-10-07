import { Skeleton } from "@automationstack/ui/components/skeleton";
import { cn } from "@automationstack/ui/lib/utils";

export interface TableSkeletonColumn {
	head: string;
	label: string;
	value: string;
	width: string;
}

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

const HEAD_BAR_HEIGHT = "h-4";

const VALUE_BAR_HEIGHT = "h-5";

function skeletonRowKeys(rows: number): string[] {
	return Array.from({ length: rows }, (_, index) => `skeleton-row-${index}`);
}

interface CellsProps {
	columns: readonly TableSkeletonColumn[];
	height: string;
	slot: "head" | "value";
}

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
	header?: boolean;
	label?: string;
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
