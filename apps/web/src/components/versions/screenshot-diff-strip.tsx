import type { ColumnScreenshotKey } from "@automationstack/db/schema/test-cases";
import { useCallback, useMemo } from "react";
import {
	screenshotGroupNames,
	screenshotMediaItems,
} from "@/components/cases/column-screenshot-group";
import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import type { MediaItem } from "@/components/media/media-item";
import { MediaLightbox } from "@/components/media/media-lightbox";
import { MediaThumb } from "@/components/media/media-thumb";
import { useMediaLightbox } from "@/components/media/use-media-lightbox";
import { StatusBadge } from "@/components/status/status-badge";

import type { ScreenshotDiffEntry } from "./screenshot-diff.ts";

const NO_UPLOADS = new Map();

interface ScreenshotDiffStripProps {
	entries: readonly ScreenshotDiffEntry[];
	group: ColumnScreenshotKey;
	imageUrls: MarkdownImageUrls;
	/** 步骤的序号，从 1 开始。 */
	position: number;
}

/** 一组截图的缩略图，以及每张截图的变化标签。没有变化的截图没有标签。 */
function useScreenshotDiffItems(
	entries: readonly ScreenshotDiffEntry[],
	groupLabel: string,
	imageUrls: MarkdownImageUrls
) {
	const items = useMemo(
		() =>
			screenshotMediaItems(
				entries.map((entry) => entry.id),
				groupLabel,
				imageUrls,
				NO_UPLOADS
			),
		[entries, groupLabel, imageUrls]
	);
	const kinds = useMemo(
		() => new Map(entries.map((entry) => [entry.id, entry.kind])),
		[entries]
	);
	const badgeFor = useCallback(
		(item: MediaItem) => {
			const kind = kinds.get(item.id);
			return kind === undefined || kind === "unchanged" ? null : (
				<StatusBadge kind="change" size="sm" value={kind} />
			);
		},
		[kinds]
	);
	return { badgeFor, items };
}

/**
 * 一组截图的对比：显示所有截图，超出宽度时换行，所以每个标签都看得到。
 * 新增、删除和移动的截图下方带统一状态标签，没有变化的截图不加标签。
 * 点缩略图打开这一组的大图浏览，大图下方也显示标签。两个版本都没有截图时不占位置。
 */
export function ScreenshotDiffStrip({
	entries,
	group,
	imageUrls,
	position,
}: ScreenshotDiffStripProps) {
	const lightbox = useMediaLightbox();
	const { groupLabel, label, titlePrefix } = screenshotGroupNames(
		position,
		group
	);
	const { badgeFor, items } = useScreenshotDiffItems(
		entries,
		groupLabel,
		imageUrls
	);
	if (items.length === 0) {
		return null;
	}
	return (
		<>
			<ul aria-label={label} className="flex flex-wrap items-start gap-1.5">
				{items.map((item, index) => (
					<li className="flex flex-col items-center gap-1" key={item.id}>
						<MediaThumb index={index} item={item} onOpen={lightbox.open} />
						{badgeFor(item)}
					</li>
				))}
			</ul>
			<MediaLightbox
				items={items}
				onClose={lightbox.close}
				open={lightbox.state !== null}
				renderActions={badgeFor}
				returnFocusTo={lightbox.state?.origin}
				startIndex={lightbox.state?.index ?? 0}
				titlePrefix={titlePrefix}
			/>
		</>
	);
}
