/**
 * Tags row of the version diff view: removed / added / kept badges.
 * Split out of `version-diff-scalars.tsx` together with the `TagBadges`
 * helper that only serves it.
 */
import { Badge } from "@automationstack/ui/components/badge";

import type { TagsDiff } from "./field-diff.ts";

function TagBadges({
	tags,
	tone,
}: {
	tags: readonly string[];
	tone: "add" | "del";
}) {
	const unique = [...new Set(tags)];
	const className =
		tone === "add"
			? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
			: "border-rose-500/40 bg-rose-500/10 text-rose-700 line-through dark:text-rose-300";
	return (
		<>
			{unique.map((tag) => (
				<Badge className={className} key={`${tone}:${tag}`} variant="outline">
					{tone === "add" ? "+" : "−"} {tag}
				</Badge>
			))}
		</>
	);
}

export function TagsSection({ tags }: { tags: TagsDiff }) {
	const hasAny = tags.added.length + tags.removed.length + tags.kept.length > 0;
	return (
		<section className="flex flex-col gap-1.5">
			<h4 className="font-medium text-muted-foreground text-xs">标签</h4>
			{hasAny ? (
				<div className="flex flex-wrap items-center gap-1.5">
					<TagBadges tags={tags.removed} tone="del" />
					<TagBadges tags={tags.added} tone="add" />
					{tags.kept.map((tag) => (
						<Badge key={`kept:${tag}`} variant="secondary">
							{tag}
						</Badge>
					))}
				</div>
			) : (
				<span className="text-muted-foreground text-xs">无标签</span>
			)}
		</section>
	);
}
