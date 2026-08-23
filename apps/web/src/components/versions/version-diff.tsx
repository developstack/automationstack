/**
 * Renders a `diffCaseSnapshots` result: scalar / preconditions / tags
 * block plus the step table. Pure presentation — the caller owns the
 * snapshots and the diff computation.
 */
import { Badge } from "@automationstack/ui/components/badge";
import { Separator } from "@automationstack/ui/components/separator";
import { ArrowRightIcon } from "lucide-react";

import type { CaseSnapshotDiff } from "./field-diff.ts";
import { VersionDiffScalars } from "./version-diff-scalars.tsx";
import { VersionDiffSteps } from "./version-diff-steps.tsx";

interface VersionDiffProps {
	/** Older side of the comparison. */
	baseVersion: number;
	diff: CaseSnapshotDiff;
	/** Newer side of the comparison. */
	targetVersion: number;
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
		<header className="flex flex-wrap items-center gap-2">
			<Badge variant="secondary">v{baseVersion}</Badge>
			<ArrowRightIcon
				aria-hidden="true"
				className="size-3.5 text-muted-foreground"
			/>
			<Badge>v{targetVersion}</Badge>
			{hasChanges ? null : (
				<span className="text-muted-foreground text-xs">两个版本内容一致</span>
			)}
		</header>
	);
}

/** Version-to-version diff view. */
export function VersionDiff({
	baseVersion,
	diff,
	targetVersion,
}: VersionDiffProps) {
	return (
		<div className="flex flex-col gap-4">
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
			<Separator />
			<VersionDiffSteps steps={diff.steps} />
		</div>
	);
}
