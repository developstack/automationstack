/**
 * 「这条用例是谁判的」——用例级的两层答案。
 *
 * 与页面底部的 `run-events.tsx` 是**两回事**，别看混：那一份记的是整个测试任务
 * 的状态流转（待评审 → 测试中 → 已提交），这一份记的是**单条用例**的结论流转
 * （未测 → 失败 → 未测）。两者的标题刻意用了不同的词（「变更历史」/「判定记录」），
 * 因为它们在同一个页面上同时可见，同名会让人以为点开的是同一份东西。
 *
 * 分两层是因为用户问的是两个粒度不同的问题：
 *
 * 1. 「这条现在算谁的账」——`RunCaseLastVerdict`（住在 `run-case-last-verdict.tsx`），
 *    一行小字常驻在结论按钮旁边，不用点开就能看见。它只回答最后一次。
 * 2. 「谁判过通过、又是谁打回的」——`RunCaseEvents`，完整时间线，默认折叠。
 *    单值字段答不了这个问题（每次改判都把上一次覆盖掉），只能问流水表。
 *
 * ## 折叠条与「执行结论」那块共用一个写法
 *
 * 这里的标题原先也是自己手写的 `<Button variant="ghost">` + 行首 chevron，于是
 * 「判定记录」四个字比下面的时间线右移了 30px。用户在执行结论那块提过一次同样的
 * 毛病，这里是第二次。两处一起收敛到 `RunSectionTrigger`，成因与做法记在那个文件里。
 */

import {
	Collapsible,
	CollapsibleContent,
} from "@automationstack/ui/components/collapsible";
import { useQuery } from "@tanstack/react-query";

import { formatDateTime } from "@/components/cases/case-meta";
import { RUN_SECTION_TEXT } from "@/components/test-runs/run-panel-typography";
import { RunSectionTrigger } from "@/components/test-runs/run-section-trigger";
import { RESULT_LABELS } from "@/components/test-runs/test-run-meta";
import { type client, orpc } from "@/utils/orpc";

/**
 * 操作人名字为空时的兜底。
 *
 * 这里**不是**「系统」（`run-events.tsx` 那份才是——测试任务有系统自动提交那条
 * 无主事件）。用例结论只可能由人打出来，`actorName` 为 null 有且只有一种成因：
 * 那个账号被删了（外键 `set null`）。署名丢了，但「有人在那一刻判了这条」这个
 * 事实还在，所以要说出来，不能留白，更不能说成「未知」。
 */
export const DELETED_ACTOR = "已注销的账号";

/** 列表行的形状直接取过程返回值本身（先例：mindmap-tree-input 的 MindmapTreeData）。 */
type RunCaseEventEntry = Awaited<
	ReturnType<typeof client.testRuns.listCaseEvents>
>[number];

/**
 * 时间线列表。从 RunCaseEvents 里拆出来不是因为复用（只在这里用），是因为加上
 * 开合动画之后触发器与内层容器把那个函数撑过了 max-lines-per-function。
 */
function RunCaseEventList({ entries }: { entries: RunCaseEventEntry[] }) {
	return (
		<ol className="flex flex-col gap-1.5">
			{/*
			 * 一行四段（时间 / 人 / 流转 / 附言）**同字号同颜色**，class 只写在 <li> 上。
			 *
			 * 原先时间与附言是 text-muted-foreground、人名与流转是默认前景色，四段挤在
			 * 一行里明暗交替。用户要求这一块「所有文字的字号、颜色要完全一致」——这一行
			 * 本来就该整体读，任何一段被挑亮都是在暗示一种其实不存在的重点：谁在什么
			 * 时候把它从什么改成了什么，四段缺一不可。
			 *
			 * tabular-nums 留着：那是对齐属性不是字号或颜色。一列时间戳里的
			 * 「25/8/20 14:03」在比例数字下每行宽度都不同，竖着扫会看成锯齿。
			 */}
			{entries.map(({ actorName, event }) => (
				<li
					className={`flex flex-wrap gap-x-2 ${RUN_SECTION_TEXT}`}
					key={event.id}
				>
					<span className="tabular-nums">
						{formatDateTime(event.createdAt)}
					</span>
					<span>{actorName ?? DELETED_ACTOR}</span>
					<span>
						{`${RESULT_LABELS[event.fromResult]} → ${RESULT_LABELS[event.toResult]}`}
					</span>
					{event.comment !== null && <span>（{event.comment}）</span>}
				</li>
			))}
		</ol>
	);
}

/**
 * 完整时间线，默认折叠。观感与 `run-events.tsx` 一致（同一种列表），
 * 差别只在流转用 `RESULT_LABELS[fromResult] → RESULT_LABELS[toResult]`、
 * 附言用 `event.comment`。
 *
 * 说明文字取的是**流水里的快照**而不是用例上的活值：打回未测会把活值整段清空，
 * 用活值渲染历史会让「他当时为什么判失败」凭空消失。
 *
 * 不做「展开才查」的懒加载：这条查询必须保持挂载，打完结论后
 * `useInvalidateTestRuns()` 刷的是 `orpc.testRuns` 整个缓存根（前缀匹配，
 * 覆盖 `listCaseEvents`），而 TanStack Query 只重取**挂载中**的查询——
 * 挂在折叠状态里，用户点开时看到的才是刚刚那一条。
 */
export function RunCaseEvents({ runCaseId }: { runCaseId: string }) {
	const eventsQuery = useQuery(
		orpc.testRuns.listCaseEvents.queryOptions({ input: { runCaseId } })
	);

	return (
		/*
		 * group/run-section 与「执行结论」那块**同名**：Tailwind 不扫描拼接出来的类名，
		 * group 名没法当参数传给共用的 `RunSectionTrigger`，两处只能约定同一个名字。
		 * 两块是兄弟节点、不嵌套，同名不会串。原来这里叫 group/run-case-events。
		 */
		<Collapsible className="group/run-section border-t pt-2">
			<RunSectionTrigger label="判定记录" />
			{/* padding 内移到内层容器：height: 0 压不住 padding，留在面板上会在
			    收起过程中露出一条空白带。 */}
			<CollapsibleContent className="collapsible-panel">
				<div className="pb-2">
					{/*
					 * 加载态不摆骨架，理由与 run-events.tsx 那处逐字相同：查询一直挂着
					 * （见组件文档末尾那段），点开时数据早已到位；条数 0..N 不定，
					 * 折叠区向下展开，灰条既预告不了形状也挡不住任何位移。
					 */}
					{eventsQuery.data?.length === 0 && (
						<p className={RUN_SECTION_TEXT}>这条用例还没有人判过结论。</p>
					)}
					{eventsQuery.data ? (
						<RunCaseEventList entries={eventsQuery.data} />
					) : null}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
