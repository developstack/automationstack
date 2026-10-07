import { Skeleton } from "@automationstack/ui/components/skeleton";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { orpc } from "@/utils/orpc";

import { diffCaseSnapshots } from "./field-diff.ts";
import { VersionDiff } from "./version-diff.tsx";
import { VersionSnapshotView } from "./version-snapshot-view.tsx";

interface VersionViewerProps {
	baseVersion: number | null;
	caseId: string;
	targetVersion: number;
}

function ViewerSkeleton() {
	return (
		<div className="flex flex-col gap-2">
			<Skeleton className="h-5 w-32" />
			<Skeleton className="h-24 w-full" />
			<Skeleton className="h-32 w-full" />
		</div>
	);
}

export function VersionViewer({
	baseVersion,
	caseId,
	targetVersion,
}: VersionViewerProps) {
	const targetQuery = useQuery(
		orpc.cases.getVersion.queryOptions({
			input: { caseId, version: targetVersion },
		})
	);
	const baseQuery = useQuery(
		orpc.cases.getVersion.queryOptions({
			input:
				baseVersion === null ? skipToken : { caseId, version: baseVersion },
		})
	);

	const target = targetQuery.data;
	const base = baseQuery.data;
	const diff = useMemo(() => {
		if (!(base && target)) {
			return null;
		}
		return diffCaseSnapshots(base.snapshot, target.snapshot);
	}, [base, target]);

	if (!target) {
		return <ViewerSkeleton />;
	}
	if (baseVersion === null) {
		return (
			<VersionSnapshotView snapshot={target.snapshot} version={targetVersion} />
		);
	}
	if (diff === null) {
		return <ViewerSkeleton />;
	}
	return (
		<VersionDiff
			baseVersion={baseVersion}
			diff={diff}
			targetVersion={targetVersion}
		/>
	);
}
