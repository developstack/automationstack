import { Badge } from "@automationstack/ui/components/badge";

import { DiffMark, type DiffMarkKind } from "./diff-mark.tsx";
import type { TagsDiff } from "./field-diff.ts";
import { VersionSection } from "./version-section.tsx";

const TAG_SIGN: Record<DiffMarkKind, string> = { added: "+", removed: "−" };

const TAG_MARK_CLASS =
	"inline-flex h-5 items-center gap-0.5 rounded-md border border-current/20 px-1.5 text-xs";

function TagMarks({
	kind,
	tags,
}: {
	kind: DiffMarkKind;
	tags: readonly string[];
}) {
	return (
		<>
			{[...new Set(tags)].map((tag) => (
				<DiffMark className={TAG_MARK_CLASS} key={`${kind}:${tag}`} kind={kind}>
					<span aria-hidden="true">{TAG_SIGN[kind]}</span>
					<span>{tag}</span>
				</DiffMark>
			))}
		</>
	);
}

/** 标签的对比：删除的标签带「−」和删除线，新增的标签带「+」和下划线，其余标签不变。 */
export function TagsSection({ tags }: { tags: TagsDiff }) {
	const hasAny = tags.added.length + tags.removed.length + tags.kept.length > 0;
	return (
		<VersionSection title="标签">
			{hasAny ? (
				<div className="flex flex-wrap items-center gap-1.5">
					<TagMarks kind="removed" tags={tags.removed} />
					<TagMarks kind="added" tags={tags.added} />
					{[...new Set(tags.kept)].map((tag) => (
						<Badge
							className="font-normal"
							key={`kept:${tag}`}
							variant="outline"
						>
							{tag}
						</Badge>
					))}
				</div>
			) : (
				<p className="text-muted-foreground text-sm">没有标签。</p>
			)}
		</VersionSection>
	);
}
