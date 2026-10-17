import { skipToken, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { CaseListError } from "@/components/cases/case-list-error";
import { VersionViewerSkeleton } from "@/components/skeletons/version-viewer-skeleton";
import { orpc } from "@/utils/orpc";

import { diffCaseSnapshots } from "./field-diff.ts";
import { VersionDiff } from "./version-diff.tsx";
import { VersionSnapshotView } from "./version-snapshot-view.tsx";

interface VersionViewerProps {
	baseVersion: number | null;
	caseId: string;
	targetVersion: number;
}

function useVersionSnapshots({
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
	const failedQuery = [targetQuery, baseQuery].find((query) => query.isError);
	const refetchTarget = targetQuery.refetch;
	const refetchBase = baseQuery.refetch;
	// 只重新加载失败的版本
	const retry = useCallback(
		() =>
			Promise.all([
				targetQuery.isError ? refetchTarget() : null,
				baseQuery.isError ? refetchBase() : null,
			]),
		[baseQuery.isError, refetchBase, refetchTarget, targetQuery.isError]
	);
	return {
		base: baseQuery.data,
		error: failedQuery?.error ?? null,
		isFetching: targetQuery.isFetching || baseQuery.isFetching,
		retry,
		target: targetQuery.data,
	};
}

/** 只选择一个版本时查看它的内容，选择两个版本时对比字段。 */
export function VersionViewer(props: VersionViewerProps) {
	const { baseVersion, caseId, targetVersion } = props;
	const { base, error, isFetching, retry, target } = useVersionSnapshots(props);
	const diff = useMemo(
		() =>
			base && target ? diffCaseSnapshots(base.snapshot, target.snapshot) : null,
		[base, target]
	);

	if (error !== null) {
		return (
			<CaseListError
				query={{ error, isFetching, refetch: retry }}
				title="版本内容加载失败"
			/>
		);
	}
	if (!target) {
		return <VersionViewerSkeleton />;
	}
	if (baseVersion === null) {
		return (
			<VersionSnapshotView
				caseId={caseId}
				snapshot={target.snapshot}
				version={targetVersion}
			/>
		);
	}
	if (diff === null) {
		return <VersionViewerSkeleton />;
	}
	return (
		<VersionDiff
			baseVersion={baseVersion}
			diff={diff}
			targetVersion={targetVersion}
		/>
	);
}
