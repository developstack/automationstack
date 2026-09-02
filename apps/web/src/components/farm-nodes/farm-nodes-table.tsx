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
import { useCallback, useState } from "react";

import { formatDateTime } from "@/components/cases/case-meta";
import { FarmNodeCapabilities } from "@/components/farm-nodes/farm-node-capabilities";
import { nodeListPollInterval } from "@/components/farm-nodes/farm-node-capability-meta";
import { FarmNodeEnabledToggle } from "@/components/farm-nodes/farm-node-enabled-toggle";
import { FarmNodeExpandToggle } from "@/components/farm-nodes/farm-node-expand-toggle";
import type { FarmNodeRow } from "@/components/farm-nodes/farm-node-meta";
import { NODE_BACKEND_LABELS } from "@/components/farm-nodes/farm-node-meta";
import { FarmNodeOnlineCell } from "@/components/farm-nodes/farm-node-online-cell";
import { FarmNodeRowActions } from "@/components/farm-nodes/farm-node-row-actions";
import { orpc } from "@/utils/orpc";

/**
 * 表格的列数，展开区那一格要横跨的就是它。写成常量而不是数一遍 `<TableHead>`：
 * 加列时漏改这里的表现是展开区比表格窄一格，而那看起来只像是没对齐。
 */
const NODE_COLUMN_COUNT = 8;

/**
 * 一行 = 一台机器。
 *
 * 停用的行整行压暗（text-muted-foreground），而不是只在某一列摆个记号：这张表
 * 的用途是「扫一眼现在有多少算力可用」，压暗之后能派活的那几行自己浮出来。
 * 注意**在线与启用是两件事**：一台停用的机器照样会心跳、照样显示在线，它只是
 * 不接新会话——所以这两列各占一格，谁也不替谁说话。
 *
 * 展开态是**每行自己的 useState**，不提到表格层：提上去就得维护一个 id 集合，
 * 而这一页刷新（轮询、拨启用开关）时那个集合要靠 id 一一对上才不会错位展开。
 * 各行自己记的话，React 按 key 复用组件时展开态天然跟着那台机器走。
 */
function NodeTableRow({ now, row }: { now: number; row: FarmNodeRow }) {
	const [expanded, setExpanded] = useState(false);
	const toggle = useCallback(() => setExpanded((value) => !value), []);

	return (
		<>
			<TableRow className={row.enabled ? undefined : "text-muted-foreground"}>
				<TableCell className="w-8">
					<FarmNodeExpandToggle
						expanded={expanded}
						nodeName={row.name}
						onToggle={toggle}
					/>
				</TableCell>
				<TableCell className="font-medium">{row.name}</TableCell>
				<TableCell>{NODE_BACKEND_LABELS[row.backend]}</TableCell>
				{/* tabular-nums：一列一两位的数字，等宽才对得齐，扫总量时不用逐行找位 */}
				<TableCell className="tabular-nums">{row.maxSlots}</TableCell>
				<TableCell>
					<FarmNodeOnlineCell
						lastSeenAt={row.lastSeenAt}
						now={now}
						online={row.online}
					/>
				</TableCell>
				<TableCell>
					<FarmNodeEnabledToggle row={row} />
				</TableCell>
				{/* tabular-nums：时间戳里的数字等宽，整列的年月日才竖着对齐 */}
				<TableCell className="text-muted-foreground tabular-nums">
					{formatDateTime(row.createdAt)}
				</TableCell>
				<TableCell className="text-right">
					<FarmNodeRowActions row={row} />
				</TableCell>
			</TableRow>
			{/*
			 * 折叠时**整行不渲染**，而不是加一个 hidden 类：这一块里有一颗会发请求的
			 * 按钮和一份可能很长的清单，留在 DOM 里等于每台机器都白付一份，而读屏与
			 * Tab 键还会走进一片看不见的内容。
			 */}
			{expanded ? (
				<TableRow>
					{/* p-0：内边距交给展开区自己，否则单元格与它各留一份、上下不对称 */}
					<TableCell className="bg-muted/30 p-0" colSpan={NODE_COLUMN_COUNT}>
						<FarmNodeCapabilities now={now} row={row} />
					</TableCell>
				</TableRow>
			) : null}
		</>
	);
}

/*
 * 整段抄成常量而不是直接写在 JSX 里：格式化器按行宽折 JSX 文本，折点落在中文
 * 句读之间时会渲染出一个多余的空格（「一台机器。 点上面的」）。
 */
const EMPTY_DESCRIPTION =
	"节点是真机上的浏览器算力：装一个 agent，那台机器就能替平台跑会话，连上来时会顺带报一份它有哪些浏览器。点上面的「添加节点」登记第一台，拿到 token 之后按下面的指引装上去。";

function FarmNodesEmpty() {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>还没有节点</EmptyTitle>
				<EmptyDescription>{EMPTY_DESCRIPTION}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

export function FarmNodesTable() {
	// useSuspenseQuery：路由 loader 已按管理员身份预取过，这里读的是同一个缓存键
	const nodesQuery = useSuspenseQuery(
		orpc.farm.nodes.list.queryOptions({
			/*
			 * 轮询节拍由数据自己决定：有机器在等探测结果就 3 秒一拍，没有就完全停。
			 * 「为什么必须写成函数」与「为什么静止时一拍都不打」在
			 * farm-node-capability-meta.ts 的 nodeListPollInterval 里。
			 */
			refetchInterval: (query) => nodeListPollInterval(query.state.data),
		})
	);

	if (nodesQuery.data.length === 0) {
		return <FarmNodesEmpty />;
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					{/* 展开列没有列名可写，读屏用视觉隐藏的文字补上 */}
					<TableHead>
						<span className="sr-only">展开能力清单</span>
					</TableHead>
					<TableHead>名称</TableHead>
					<TableHead>后端</TableHead>
					<TableHead>槽位上限</TableHead>
					<TableHead>在线</TableHead>
					<TableHead>启用</TableHead>
					<TableHead>创建时间</TableHead>
					{/* 空表头会被读屏念成一列没名字的单元格，用视觉隐藏的文字补上 */}
					<TableHead className="text-right">
						<span className="sr-only">操作</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{/*
				 * 顺序原样照抄服务端，前端不再排一次——同一份顺序两处各排一遍，
				 * 迟早有一处先改（与浏览器目录表同一条约定）。
				 *
				 * `dataUpdatedAt` 当「现在」发给每一行：它随 dehydrate 一起序列化，
				 * SSR 与 hydrate 两侧读到同一个数字，首帧因此逐字节一致；而且它不是
				 * 个假值——那一刻的「几秒前」本来就是按数据取回的时刻算的。
				 * 这一页不自己起定时器：节点状态由心跳驱动（30 秒一拍），为它挂一条
				 * 每秒的重渲染只会让相对时间的字跳，而窗口重新聚焦时 React Query 的
				 * refetchOnWindowFocus 会补一次真数据。
				 */}
				{nodesQuery.data.map((row) => (
					<NodeTableRow key={row.id} now={nodesQuery.dataUpdatedAt} row={row} />
				))}
			</TableBody>
		</Table>
	);
}
