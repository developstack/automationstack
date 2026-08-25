import type { CaseStatus } from "@automationstack/db/schema/test-cases";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import { cn } from "@automationstack/ui/lib/utils";
import { useSuspenseQuery } from "@tanstack/react-query";

import { STATUS_LABELS } from "@/components/cases/case-meta";
import { OverviewDonut } from "@/components/overview/overview-donut";
import { orpc } from "@/utils/orpc";

/**
 * 状态的展示顺序刻意不是字母序（active / deprecated / draft），而是生命周期序：
 * 生效 → 草稿 → 废弃。这张卡回答的是「现在有多少可用资产」，最该先看到的是生效数，
 * 废弃是这条链的终点，排最后。
 */
const STATUS_ORDER: readonly CaseStatus[] = ["active", "draft", "deprecated"];

/**
 * 三态在环上的取色，以及下面计数行里那枚色块的对应类。
 *
 * 015 起是语义色，映射由用户指定：生效=通过色（绿）、草稿=阻塞色（黄）、
 * 废弃=跳过色（灰）。直接复用 014 为报告页立的 --result-* 三支，不另立令牌、
 * 不改值；failed 没有对应的状态，不出现。
 *
 * 环上顺时针仍按 STATUS_ORDER 的生命周期排，但「深浅跟着生命周期走」的旧论证
 * 已不成立——换语义色后草稿（黄，L=0.891）反而比废弃（灰，L=0.814）浅。
 * 层次来自语义（绿是主角、黄是未定、灰是终点），不再来自灰阶深浅。
 *
 * 对比度立场同 014：亮底黄 1.39:1、灰 1.78:1 压卡面不足 WCAG 1.4.11 的 3:1，
 * 主编码是紧邻的文字标签，相邻扇区另有 OverviewDonut 的 CHART_SEAM 描缝兜底。
 *
 * ⚠️ 这里仍刻意**不**复用 case-table 那套 STATUS_DOT_CLASSES。这三行就是环形图
 * 的图例，图例色块与扇区颜色必须同色，读者才能把哪段圆弧对上哪一行。如今两边
 * 的「生效」倒都是绿系（case-table 用 bg-success），语义方向一致了，但令牌仍
 * 不同源——跨页一致性照旧让位于「图例=扇区同色」，何况两处真正认人的都是紧邻
 * 的文字标签，色块只是冗余编码。
 */
const STATUS_SLICES: Record<CaseStatus, { color: string; swatch: string }> = {
	active: { color: "var(--result-passed)", swatch: "bg-result-passed" },
	deprecated: { color: "var(--result-skipped)", swatch: "bg-result-skipped" },
	draft: { color: "var(--result-blocked)", swatch: "bg-result-blocked" },
};

interface StatusRowProps {
	count: number;
	status: CaseStatus;
}

function StatusRow({ count, status }: StatusRowProps) {
	return (
		<div className="flex items-center justify-between gap-2 text-sm">
			<dt className="flex items-center gap-2 text-muted-foreground">
				{/* aria-hidden：色块只是冗余编码，紧邻的文字标签才是信息本体。 */}
				<span
					aria-hidden="true"
					className={cn("size-2 rounded-full", STATUS_SLICES[status].swatch)}
				/>
				{STATUS_LABELS[status]}
			</dt>
			{/* tabular-nums：三行数字右对齐时等宽才不会左右错位 */}
			<dd className="tabular-nums">{count}</dd>
		</div>
	);
}

interface OverviewTotalsCardProps {
	projectId: string;
}

/**
 * 第 1 张卡：用例总数与状态分布。
 *
 * 与优先级分布条共用 `projectStats.overview` 这一条查询——后端刻意把两者合在
 * 一次 test_cases 扫描里返回，这里各取所需即可，react-query 会去重成一次请求。
 */
export function OverviewTotalsCard({ projectId }: OverviewTotalsCardProps) {
	const { data } = useSuspenseQuery(
		orpc.projectStats.overview.queryOptions({ input: { projectId } })
	);
	const { statusCounts, totalCases } = data;

	return (
		<Card>
			<CardHeader>
				<CardTitle>用例总数</CardTitle>
				<CardDescription>项目里的用例存量，按状态拆分</CardDescription>
			</CardHeader>
			<CardContent>
				{/*
				 * 空态给一句话而不是留白：只剩一个孤零零的 0 时，用户分不清是「真的没有」
				 * 还是「没查出来」，也不知道下一步该做什么（同 case-collaborators-cell.tsx
				 * 里那个破折号的理由）。
				 */}
				{totalCases === 0 ? (
					<p className="text-muted-foreground text-sm">
						查过了：这个项目一条用例都还没有。先在左侧模块树里建一个模块，再往里新建用例。
					</p>
				) : (
					<>
						<OverviewDonut
							centerLabel="条用例"
							centerValue={String(totalCases)}
							slices={STATUS_ORDER.map((status) => ({
								color: STATUS_SLICES[status].color,
								key: status,
								label: STATUS_LABELS[status],
								value: statusCounts[status],
							}))}
						/>
						{/*
						 * 总数原来是一行 text-3xl，现在挪进了环心——那是 SVG 文本，且整块图
						 * aria-hidden，读屏拿到的是空的。这里补一份文字等价物。只补总数：
						 * 三态的读数下面的 dl 本来就有，再念一遍只会更吵。
						 */}
						<p className="sr-only">{`共 ${totalCases} 条用例`}</p>
						<dl className="flex flex-col gap-1.5">
							{STATUS_ORDER.map((status) => (
								<StatusRow
									count={statusCounts[status]}
									key={status}
									status={status}
								/>
							))}
						</dl>
					</>
				)}
			</CardContent>
		</Card>
	);
}
