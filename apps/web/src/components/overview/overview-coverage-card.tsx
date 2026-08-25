import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import { cn } from "@automationstack/ui/lib/utils";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import {
	type DonutSlice,
	OverviewDonut,
} from "@/components/overview/overview-donut";
import { orpc } from "@/utils/orpc";

/** 卡片里只点名前几个缺口模块，其余靠计数提示；全量在模块树里逐个看。 */
const GAP_SAMPLE_SIZE = 5;

/**
 * 后端 gap 的两种取值。这里就地写出联合类型而不是从 packages/db 引：web 只该
 * 依赖 API 的输出形状，把 repository 的类型拉进浏览器包会把数据层的实现细节
 * 变成前端的编译依赖。
 */
type ModuleGap = "empty" | "no-active";

const GAP_LABELS: Record<ModuleGap, string> = {
	empty: "零用例",
	"no-active": "无生效用例",
};

interface GapSample {
	gap: ModuleGap;
	moduleId: string;
	name: string;
}

interface CoverageModule {
	gap: ModuleGap | null;
	moduleId: string;
	name: string;
}

/**
 * 挑出前若干个有缺口的模块。
 *
 * 用 flatMap 而不是 filter：filter 收窄不了 `gap` 的类型，后面渲染标签时就得
 * 补一个永远走不到的 null 分支——那种分支读代码的人无从判断是不是真会发生。
 */
function pickGapSamples(modules: readonly CoverageModule[]): GapSample[] {
	return modules
		.flatMap((module) =>
			module.gap === null
				? []
				: [{ gap: module.gap, moduleId: module.moduleId, name: module.name }]
		)
		.slice(0, GAP_SAMPLE_SIZE);
}

interface GapCountRowProps {
	count: number;
	label: string;
	/** 图例色块的类，必须与环上同名扇区的 fill 是同一档，见 COVERAGE_SLICES。 */
	swatch: string;
}

function GapCountRow({ count, label, swatch }: GapCountRowProps) {
	return (
		<div className="flex items-center justify-between gap-2 text-sm">
			<dt className="flex items-center gap-2 text-muted-foreground">
				{/* aria-hidden：色块只是冗余编码，紧邻的文字标签才是信息本体。 */}
				<span
					aria-hidden="true"
					className={cn("size-2 rounded-full", swatch)}
				/>
				{label}
			</dt>
			<dd className="tabular-nums">{count}</dd>
		</div>
	);
}

/**
 * 环上三段的配色与图例文案，顺时针顺序 = 下面三行计数行的上下顺序。
 *
 * 015 起按「覆盖健康度」借报告页的结论色（--result-* 三支）：有生效用例=通过绿、
 * 有用例但无生效=阻塞黄、零用例=跳过灰。这与用例总数卡那张状态环是同一条规矩
 * （生效=绿、无生效=黄、空=灰），两张环在新色彩空间里仍是一套东西。
 *
 * 对比度立场同 014：亮底黄 1.39:1、灰 1.78:1 压卡面不足 WCAG 1.4.11 的 3:1，
 * 主编码是紧邻的文字标签，相邻扇区另有 CHART_SEAM 描缝兜底。轨道仍走
 * OverviewDonut 内置的 --chart-1，不进数据系列。
 */
const COVERAGE_SLICES = [
	{
		color: "var(--result-passed)",
		key: "covered",
		label: "有生效用例",
		swatch: "bg-result-passed",
	},
	{
		color: "var(--result-blocked)",
		key: "no-active",
		label: "有用例但无生效用例",
		swatch: "bg-result-blocked",
	},
	{
		color: "var(--result-skipped)",
		key: "empty",
		label: "零用例",
		swatch: "bg-result-skipped",
	},
] as const;

interface GapModuleLinkProps extends GapSample {
	projectId: string;
}

function GapModuleLink({ gap, moduleId, name, projectId }: GapModuleLinkProps) {
	return (
		<li className="flex items-center justify-between gap-2 text-sm">
			{/*
			 * 点名之后要能直接去处理：链接落到该模块的用例列表，正是补用例的地方。
			 * search 只写 moduleId，其余筛选留空——带着上一页的关键词过去会让人以为
			 * 这个模块「连一条都搜不到」。
			 */}
			<Link
				className="truncate hover:underline"
				params={{ projectId }}
				search={{ moduleId }}
				to="/projects/$projectId"
			>
				{name}
			</Link>
			<span className="shrink-0 text-muted-foreground text-xs">
				{GAP_LABELS[gap]}
			</span>
		</li>
	);
}

interface CoverageGapListProps {
	gapCount: number;
	projectId: string;
	samples: GapSample[];
	totalModuleCount: number;
}

/**
 * 缺口名单。没有缺口时不留一个空的 <ul>，改成一句写明「查过了」的结论——
 * 空列表和「还没查」在页面上长得一模一样。
 */
function CoverageGapList({
	gapCount,
	projectId,
	samples,
	totalModuleCount,
}: CoverageGapListProps) {
	if (gapCount === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				查过了：{totalModuleCount} 个模块都有生效用例，没有缺口。
			</p>
		);
	}

	return (
		<ul className="flex flex-col gap-1.5 border-t pt-3">
			{samples.map((sample) => (
				<GapModuleLink
					gap={sample.gap}
					key={sample.moduleId}
					moduleId={sample.moduleId}
					name={sample.name}
					projectId={projectId}
				/>
			))}
		</ul>
	);
}

interface CoverageBodyProps {
	emptyModuleCount: number;
	noActiveModuleCount: number;
	projectId: string;
	samples: GapSample[];
	totalModuleCount: number;
}

/** 三段的取值，顺序与 COVERAGE_SLICES 一一对应。 */
function countsOf(props: CoverageBodyProps): readonly number[] {
	const covered =
		props.totalModuleCount - props.emptyModuleCount - props.noActiveModuleCount;
	return [covered, props.noActiveModuleCount, props.emptyModuleCount];
}

function buildSlices(props: CoverageBodyProps): DonutSlice[] {
	const counts = countsOf(props);
	return COVERAGE_SLICES.map((slice, index) => ({
		color: slice.color,
		key: slice.key,
		label: slice.label,
		value: counts[index] ?? 0,
	}));
}

/** 有模块时的正文：缺口环 + 三行计数 + 点名前几个。 */
function CoverageBody(props: CoverageBodyProps) {
	const { emptyModuleCount, totalModuleCount } = props;
	const gapCount = emptyModuleCount + props.noActiveModuleCount;
	const hidden = gapCount - props.samples.length;
	const counts = countsOf(props);

	return (
		<>
			{/*
			 * 环心放缺口数而不是模块总数：这张卡问的是「哪里没盖到」，缺口才是读数。
			 * 原来那行 text-3xl 的「N / M 个模块」整体挪进了环心（M 落在下面那行标注里）。
			 */}
			<OverviewDonut
				centerLabel={`缺口 / ${totalModuleCount}`}
				centerValue={String(gapCount)}
				slices={buildSlices(props)}
			/>
			<p className="sr-only">
				{`${totalModuleCount} 个模块里有 ${gapCount} 个存在覆盖缺口`}
			</p>
			<dl className="flex flex-col gap-1.5">
				{COVERAGE_SLICES.map((slice, index) => (
					<GapCountRow
						count={counts[index] ?? 0}
						key={slice.key}
						label={slice.label}
						swatch={slice.swatch}
					/>
				))}
			</dl>
			<CoverageGapList
				gapCount={gapCount}
				projectId={props.projectId}
				samples={props.samples}
				totalModuleCount={totalModuleCount}
			/>
			{hidden > 0 ? (
				<p className="text-muted-foreground text-xs">
					还有 {hidden} 个有缺口的模块未列出。
				</p>
			) : null}
		</>
	);
}

interface OverviewCoverageCardProps {
	projectId: string;
}

/**
 * 第 3 张卡：模块覆盖缺口。
 *
 * 判定口径是**子树**（后端定的，见 repositories/project-stats-coverage.ts）：
 * 中间层模块在本产品里就是文件夹，按「直接挂载」判缺口会把每个文件夹都标成
 * 零用例，卡片会被噪声淹没。描述里把这一句写给用户看，否则「这个模块明明有
 * 子模块有用例，为什么不算缺口」会变成一个反复被问的问题。
 */
export function OverviewCoverageCard({ projectId }: OverviewCoverageCardProps) {
	const { data } = useSuspenseQuery(
		orpc.projectStats.coverage.queryOptions({ input: { projectId } })
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>模块覆盖缺口</CardTitle>
				<CardDescription>按子树判定：整棵子树都没有用例才算空</CardDescription>
			</CardHeader>
			<CardContent>
				{data.totalModuleCount === 0 ? (
					<p className="text-muted-foreground text-sm">
						查过了：这个项目还没有模块，没有可以判定覆盖的对象。
					</p>
				) : (
					<CoverageBody
						emptyModuleCount={data.emptyModuleCount}
						noActiveModuleCount={data.noActiveModuleCount}
						projectId={projectId}
						samples={pickGapSamples(data.modules)}
						totalModuleCount={data.totalModuleCount}
					/>
				)}
			</CardContent>
		</Card>
	);
}
