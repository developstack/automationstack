import type {
	CaseStep,
	ColumnScreenshotKey,
} from "@automationstack/db/schema/test-cases";
import { useMemo } from "react";
import {
	screenshotEntries,
	screenshotGroupNames,
	screenshotMediaItems,
} from "@/components/cases/column-screenshot-group";
import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { MediaGallery } from "@/components/media/media-gallery";

const NO_UPLOADS = new Map();

interface ColumnScreenshotGalleryProps {
	group: ColumnScreenshotKey;
	imageUrls: MarkdownImageUrls;
	position: number;
	step: CaseStep;
}

/** 只读的一组截图（操作截图或预期截图）：单元格文字下方的缩略图条和大图浏览。没有截图时不占位置。 */
export function ColumnScreenshotGallery({
	group,
	imageUrls,
	position,
	step,
}: ColumnScreenshotGalleryProps) {
	const { groupLabel, label, titlePrefix } = screenshotGroupNames(
		position,
		group
	);
	const entries = screenshotEntries(step, group);
	const items = useMemo(
		() => screenshotMediaItems(entries, groupLabel, imageUrls, NO_UPLOADS),
		[entries, groupLabel, imageUrls]
	);
	return <MediaGallery items={items} label={label} titlePrefix={titlePrefix} />;
}
