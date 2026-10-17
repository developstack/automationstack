import { ArrowRightIcon } from "lucide-react";

import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";

import { DiffMark } from "./diff-mark.tsx";
import type { CaseSnapshotDiff } from "./field-diff.ts";
import { VersionDiffScalars } from "./version-diff-scalars.tsx";
import { VersionDiffSteps } from "./version-diff-steps.tsx";
import { VersionTag } from "./version-tag.tsx";

interface VersionDiffProps {
	baseVersion: number;
	diff: CaseSnapshotDiff;
	/** 截图的地址。删除的截图仍然可以显示，因为附件没有删除。 */
	imageUrls: MarkdownImageUrls;
	targetVersion: number;
}

/** 图例：说明下划线和删除线的含义，不只靠颜色。读屏软件已经读出「新增」和「删除」，所以隐藏图例。 */
function DiffLegend() {
	return (
		<p
			aria-hidden="true"
			className="flex items-center gap-3 text-muted-foreground text-xs"
		>
			<span>
				<DiffMark className="px-1" kind="added">
					新增
				</DiffMark>{" "}
				带下划线
			</span>
			<span>
				<DiffMark className="px-1" kind="removed">
					删除
				</DiffMark>{" "}
				带删除线
			</span>
		</p>
	);
}

function DiffHeader({
	baseVersion,
	hasChanges,
	targetVersion,
}: {
	baseVersion: number;
	hasChanges: boolean;
	targetVersion: number;
}) {
	return (
		<header className="flex flex-wrap items-center justify-between gap-2">
			<div className="flex items-center gap-2">
				<span className="eyebrow">对比</span>
				<VersionTag version={baseVersion} />
				<ArrowRightIcon
					aria-hidden="true"
					className="icon-stroke-regular size-3.5 text-muted-foreground"
				/>
				<span className="sr-only">到</span>
				<VersionTag version={targetVersion} />
			</div>
			{hasChanges ? (
				<DiffLegend />
			) : (
				<p className="text-muted-foreground text-xs">两个版本的内容相同。</p>
			)}
		</header>
	);
}

/** 两个版本的字段对比：先是字段、前置条件和标签，再是操作步骤。 */
export function VersionDiff({
	baseVersion,
	diff,
	imageUrls,
	targetVersion,
}: VersionDiffProps) {
	return (
		<div className="flex flex-col gap-6">
			<DiffHeader
				baseVersion={baseVersion}
				hasChanges={diff.hasChanges}
				targetVersion={targetVersion}
			/>
			<VersionDiffScalars
				preconditions={diff.preconditions}
				scalars={diff.scalars}
				tags={diff.tags}
			/>
			<VersionDiffSteps imageUrls={imageUrls} steps={diff.steps} />
		</div>
	);
}
