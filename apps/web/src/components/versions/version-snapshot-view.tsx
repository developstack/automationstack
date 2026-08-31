/**
 * Read-only rendering of a single `CaseSnapshot`: scalar fields (in
 * `snapshot-fields.tsx`), preconditions, tags and the step table. Used when
 * the history panel has exactly one version selected (or only one version
 * exists).
 */
import type { CaseSnapshot } from "@automationstack/db/schema/test-cases";
import { Badge } from "@automationstack/ui/components/badge";
import { Separator } from "@automationstack/ui/components/separator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";

import { SnapshotFields } from "./snapshot-fields.tsx";

function SnapshotTags({ tags }: { tags: readonly string[] }) {
	const unique = [...new Set(tags)];
	return (
		<section className="flex flex-col gap-1.5">
			<h4 className="font-medium text-muted-foreground text-xs">标签</h4>
			{unique.length === 0 ? (
				<span className="text-muted-foreground text-xs">无标签</span>
			) : (
				<div className="flex flex-wrap items-center gap-1.5">
					{unique.map((tag) => (
						<Badge key={tag} variant="secondary">
							{tag}
						</Badge>
					))}
				</div>
			)}
		</section>
	);
}

function SnapshotSteps({ snapshot }: { snapshot: CaseSnapshot }) {
	return (
		<section className="flex flex-col gap-2">
			<h4 className="font-medium text-muted-foreground text-xs">步骤</h4>
			{snapshot.steps.length === 0 ? (
				<p className="text-muted-foreground text-xs">该版本没有步骤。</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>序号</TableHead>
							<TableHead>步骤</TableHead>
							<TableHead>预期结果</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{snapshot.steps.map((step, index) => (
							<TableRow key={step.id}>
								<TableCell className="align-top text-muted-foreground">
									{index + 1}
								</TableCell>
								<TableCell className="w-1/2 whitespace-normal align-top">
									{step.step}
								</TableCell>
								<TableCell className="w-1/2 whitespace-normal align-top">
									{step.expected}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</section>
	);
}

interface VersionSnapshotViewProps {
	snapshot: CaseSnapshot;
	version: number;
}

/** Read-only view of one historical snapshot. */
export function VersionSnapshotView({
	snapshot,
	version,
}: VersionSnapshotViewProps) {
	return (
		<div className="flex flex-col gap-4">
			<header className="flex flex-wrap items-center gap-2">
				<Badge>v{version}</Badge>
				<span className="text-muted-foreground text-xs">
					再选择一个版本即可对比
				</span>
			</header>
			<SnapshotFields snapshot={snapshot} />
			<section className="flex flex-col gap-1.5">
				<h4 className="font-medium text-muted-foreground text-xs">前置条件</h4>
				<p className="whitespace-pre-wrap break-words text-xs leading-relaxed">
					{snapshot.preconditions ?? "无前置条件"}
				</p>
			</section>
			<SnapshotTags tags={snapshot.tags} />
			<Separator />
			<SnapshotSteps snapshot={snapshot} />
		</div>
	);
}
