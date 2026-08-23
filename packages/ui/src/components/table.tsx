import { cn } from "@automationstack/ui/lib/utils";
import type * as React from "react";

function Table({ className, ...props }: React.ComponentProps<"table">) {
	return (
		<div
			className="relative w-full overflow-x-auto"
			data-slot="table-container"
		>
			<table
				className={cn("w-full caption-bottom text-sm", className)}
				data-slot="table"
				{...props}
			/>
		</div>
	);
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
	return (
		<thead
			// 这条线分的是「表头 | 数据」两类东西：跨过它含义就从列名变成了数据。
			// 它与 TableRow 的行线分工不同——行线切的是同类数据的一行与下一行，
			// 这条切的是类别边界，所以两条线并存，谁也替代不了谁。
			className={cn("[&_tr]:border-b", className)}
			data-slot="table-header"
			{...props}
		/>
	);
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
	return (
		// 刻意不加上游的 [&_tr:last-child]:border-0：border-0 是 border-width 简写，
		// 会连选中行的 border-l-2 标记条一起抹掉（见 apps/web/src/components/cases/
		// case-table.tsx 的 ROW_MARKER）。末行的行线本来也该留着，理由见 TableRow。
		<tbody className={className} data-slot="table-body" {...props} />
	);
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
	return (
		<tfoot
			className={cn(
				"border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
				className
			)}
			data-slot="table-footer"
			{...props}
		/>
	);
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
	return (
		<tr
			className={cn(
				// 用户明确要求「测试用例的列表表格还是把线画出来吧」。数据表是横向扫读、
				// 多列对照的场景：眼睛从最左的名称挪到最右的时间要跨过整屏宽度，行线把
				// 这一行兜住，不至于半路串到隔壁行——它在这里承担的是结构职责，不是装饰。
				// 末行也照画、不做例外：表格外层没有容器边框，这条线正好把表格收口，
				// 与下方隔着 gap-3 的分页条分开。
				"border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
				className
			)}
			data-slot="table-row"
			{...props}
		/>
	);
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
	return (
		<th
			className={cn(
				"h-10 whitespace-nowrap px-2 text-left align-middle font-medium text-foreground [&:has([role=checkbox])]:pr-0",
				className
			)}
			data-slot="table-head"
			{...props}
		/>
	);
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
	return (
		<td
			className={cn(
				"whitespace-nowrap p-2 align-middle [&:has([role=checkbox])]:pr-0",
				className
			)}
			data-slot="table-cell"
			{...props}
		/>
	);
}

function TableCaption({
	className,
	...props
}: React.ComponentProps<"caption">) {
	return (
		<caption
			className={cn("mt-4 text-muted-foreground text-sm", className)}
			data-slot="table-caption"
			{...props}
		/>
	);
}

export {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
};
