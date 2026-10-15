import { useCallback, useMemo } from "react";

import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { StepScreenshotGallery } from "@/components/cases/step-screenshot-gallery";
import { StatusBadge } from "@/components/status/status-badge";

import type { ScreenshotDiffEntry } from "./screenshot-diff.ts";

interface StepScreenshotsDiffProps {
	entries: readonly ScreenshotDiffEntry[];
	imageUrls: MarkdownImageUrls;
	label: string;
}

/** 一个步骤的截图对比：新增、删除和移动的截图带统一状态标签，没有变化的截图不加标记。 */
export function StepScreenshotsDiff({
	entries,
	imageUrls,
	label,
}: StepScreenshotsDiffProps) {
	const ids = useMemo(() => entries.map((entry) => entry.id), [entries]);
	const kinds = useMemo(
		() => new Map(entries.map((entry) => [entry.id, entry.kind])),
		[entries]
	);
	const badgeFor = useCallback(
		(id: string) => {
			const kind = kinds.get(id);
			return kind === undefined || kind === "unchanged" ? null : (
				<StatusBadge kind="change" size="sm" value={kind} />
			);
		},
		[kinds]
	);
	return (
		<StepScreenshotGallery
			badgeFor={badgeFor}
			ids={ids}
			imageUrls={imageUrls}
			label={label}
		/>
	);
}
