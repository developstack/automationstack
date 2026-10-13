import type { CaseSnapshot } from "@automationstack/db/schema/test-cases";
import { Badge } from "@automationstack/ui/components/badge";

import { useCaseAttachmentUrls } from "@/components/cases/case-attachment-context";
import { CaseStepsTable } from "@/components/cases/case-steps-table";
import { MarkdownRender } from "@/components/cases/markdown-render";

import { SnapshotFields } from "./snapshot-fields.tsx";
import { VersionSection } from "./version-section.tsx";
import { VersionTag } from "./version-tag.tsx";

function SnapshotTags({ tags }: { tags: readonly string[] }) {
	const unique = [...new Set(tags)];
	if (unique.length === 0) {
		return <p className="text-muted-foreground text-sm">没有标签。</p>;
	}
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{unique.map((tag) => (
				<Badge className="font-normal" key={tag} variant="outline">
					{tag}
				</Badge>
			))}
		</div>
	);
}

interface VersionSnapshotViewProps {
	caseId: string;
	snapshot: CaseSnapshot;
	version: number;
}

/** 一个版本的完整内容。前置条件和步骤按 Markdown 显示，与用例详情一致。 */
export function VersionSnapshotView({
	caseId,
	snapshot,
	version,
}: VersionSnapshotViewProps) {
	const imageUrls = useCaseAttachmentUrls(caseId);
	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span className="eyebrow">查看</span>
					<VersionTag version={version} />
				</div>
				<p className="text-muted-foreground text-xs">
					在左侧再选择一个版本，可以对比两个版本。
				</p>
			</header>
			<SnapshotFields snapshot={snapshot} />
			<VersionSection title="前置条件">
				{snapshot.preconditions ? (
					<MarkdownRender imageUrls={imageUrls} text={snapshot.preconditions} />
				) : (
					<p className="text-muted-foreground text-sm">没有前置条件。</p>
				)}
			</VersionSection>
			<VersionSection title="标签">
				<SnapshotTags tags={snapshot.tags} />
			</VersionSection>
			<VersionSection title="操作步骤">
				<CaseStepsTable
					emptyText="这个版本没有步骤。"
					imageUrls={imageUrls}
					steps={snapshot.steps}
				/>
			</VersionSection>
		</div>
	);
}
