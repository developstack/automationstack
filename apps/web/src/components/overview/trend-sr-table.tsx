import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import { formatCount } from "@/components/overview/overview-metrics";

export interface TrendSrColumn<TRow> {
	countOf: (row: TRow) => number;
	key: string;
	label: string;
}

interface TrendSrTableProps<TRow extends { range: string }> {
	caption: string;
	columns: readonly TrendSrColumn<TRow>[];
	rows: readonly TRow[];
}

/** 趋势图的数据表，只给屏幕阅读器。图表本身对屏幕阅读器隐藏。 */
export function TrendSrTable<TRow extends { range: string }>({
	caption,
	columns,
	rows,
}: TrendSrTableProps<TRow>) {
	return (
		<Table className="sr-only">
			<TableCaption>{caption}</TableCaption>
			<TableHeader>
				<TableRow>
					<TableHead scope="col">7 天区间</TableHead>
					{columns.map((column) => (
						<TableHead key={column.key} scope="col">
							{column.label}
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={row.range}>
						<TableHead scope="row">{row.range}</TableHead>
						{columns.map((column) => (
							<TableCell key={column.key}>
								{formatCount(column.countOf(row))}
							</TableCell>
						))}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
