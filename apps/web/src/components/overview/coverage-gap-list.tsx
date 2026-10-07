import { Link } from "@tanstack/react-router";

export type ModuleGap = "empty" | "no-active";

const GAP_LABELS: Record<ModuleGap, string> = {
	empty: "零用例",
	"no-active": "无生效用例",
};

export interface GapSample {
	gap: ModuleGap;
	moduleId: string;
	name: string;
}

interface GapModuleLinkProps extends GapSample {
	projectId: string;
}

function GapModuleLink({ gap, moduleId, name, projectId }: GapModuleLinkProps) {
	return (
		<li className="flex items-center justify-between gap-2 text-sm">
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

export function CoverageGapList({
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
