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
		<table className="sr-only">
			<caption>{caption}</caption>
			<thead>
				<tr>
					<th scope="col">7 天区间</th>
					{columns.map((column) => (
						<th key={column.key} scope="col">
							{column.label}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{rows.map((row) => (
					<tr key={row.range}>
						<th scope="row">{row.range}</th>
						{columns.map((column) => (
							<td key={column.key}>{formatCount(column.countOf(row))}</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
}
