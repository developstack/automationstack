import type { FarmBrowser } from "@automationstack/db/schema/farm-browsers";
import { Badge } from "@automationstack/ui/components/badge";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import { useSuspenseQuery } from "@tanstack/react-query";

import { formatDateTime } from "@/components/cases/case-meta";
import { FarmBrowserRowActions } from "@/components/farm-browsers/farm-browser-row-actions";
import { orpc } from "@/utils/orpc";

/**
 * 一行 = 目录里的一个 browser+version。
 *
 * 停用的行整行压暗（text-muted-foreground），而不是只在状态列摆一枚徽标：
 * 这张表的用途是「扫一眼哪些版本现在能用」，压暗之后能用的那几行自己浮出来。
 * 同理「默认」是一枚徽标而不是一列打勾——全表只有一行是真，为它单开一列，
 * 剩下每一行都摆一个空格子。
 */
function FarmBrowserRow({ row }: { row: FarmBrowser }) {
	return (
		<TableRow className={row.enabled ? undefined : "text-muted-foreground"}>
			<TableCell className="font-medium">{row.browser}</TableCell>
			{/* 版本与镜像用等宽：它们要被逐字抄进脚本，l/1、O/0 得分得开 */}
			<TableCell className="font-mono text-xs">{row.version}</TableCell>
			<TableCell className="font-mono text-xs">{row.image}</TableCell>
			<TableCell>
				{row.isDefault ? <Badge variant="secondary">默认</Badge> : null}
			</TableCell>
			<TableCell>
				{/*
				 * 停用态用 outline，与平台用户表同一条约定：已停用的行本来就该退到
				 * 背景里，用 destructive 会让它看起来像一条待处理的报错。
				 */}
				<Badge variant={row.enabled ? "secondary" : "outline"}>
					{row.enabled ? "启用" : "已停用"}
				</Badge>
			</TableCell>
			{/* tabular-nums：时间戳里的数字等宽，整列的年月日才竖着对齐 */}
			<TableCell className="text-muted-foreground tabular-nums">
				{formatDateTime(row.updatedAt)}
			</TableCell>
			<TableCell className="text-right">
				<FarmBrowserRowActions row={row} />
			</TableCell>
		</TableRow>
	);
}

function FarmBrowsersEmpty() {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>镜像库还是空的</EmptyTitle>
				<EmptyDescription>
					镜像库为空时，docker 后端的节点不知道该拉哪个镜像——那条路上要用的每个
					browser/version 都得在这里有一行。点「添加镜像」加上第一行。 （local
					后端的节点不看这张表，它们起的是机器上装着的浏览器。）
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

export function FarmBrowsersTable() {
	// useSuspenseQuery：路由 loader 已按管理员身份预取过，这里读的是同一个缓存键
	const browsersQuery = useSuspenseQuery(
		orpc.farm.browsers.list.queryOptions()
	);

	if (browsersQuery.data.length === 0) {
		return <FarmBrowsersEmpty />;
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>浏览器</TableHead>
					<TableHead>版本</TableHead>
					<TableHead>镜像</TableHead>
					{/* 空表头会被读屏念成一列没名字的单元格，用视觉隐藏的文字补上 */}
					<TableHead>
						<span className="sr-only">默认</span>
					</TableHead>
					<TableHead>状态</TableHead>
					<TableHead>更新时间</TableHead>
					<TableHead className="text-right">
						<span className="sr-only">操作</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{/*
				 * 顺序原样照抄服务端，前端不再排一次——同一份顺序两处各排一遍，
				 * 迟早有一处先改（与平台用户表同一条约定）。
				 */}
				{browsersQuery.data.map((row) => (
					<FarmBrowserRow key={row.id} row={row} />
				))}
			</TableBody>
		</Table>
	);
}
