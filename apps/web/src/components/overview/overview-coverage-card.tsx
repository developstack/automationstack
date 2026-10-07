import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import { cn } from "@automationstack/ui/lib/utils";
import { useSuspenseQuery } from "@tanstack/react-query";

import {
	CoverageGapList,
	type GapSample,
	type ModuleGap,
} from "@/components/overview/coverage-gap-list";
import {
	type DonutSlice,
	OverviewDonut,
} from "@/components/overview/overview-donut";
import { orpc } from "@/utils/orpc";

const GAP_SAMPLE_SIZE = 5;

interface CoverageModule {
	gap: ModuleGap | null;
	moduleId: string;
	name: string;
}

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
	swatch: string;
}

function GapCountRow({ count, label, swatch }: GapCountRowProps) {
	return (
		<div className="flex items-center justify-between gap-2 text-sm">
			<dt className="flex items-center gap-2 text-muted-foreground">
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

interface CoverageBodyProps {
	emptyModuleCount: number;
	noActiveModuleCount: number;
	projectId: string;
	samples: GapSample[];
	totalModuleCount: number;
}

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

function CoverageBody(props: CoverageBodyProps) {
	const { emptyModuleCount, totalModuleCount } = props;
	const gapCount = emptyModuleCount + props.noActiveModuleCount;
	const hidden = gapCount - props.samples.length;
	const counts = countsOf(props);

	return (
		<>
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
