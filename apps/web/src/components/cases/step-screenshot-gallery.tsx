import type {
	CaseStep,
	CaseStepScreenshotKey,
} from "@automationstack/db/schema/test-cases";
import { useMemo } from "react";

import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import {
	screenshotEntries,
	screenshotGroupNames,
	screenshotMediaItems,
} from "@/components/cases/step-screenshot-group";
import { MediaGallery } from "@/components/media/media-gallery";

const NO_UPLOADS = new Map();

interface StepScreenshotGalleryProps {
	group: CaseStepScreenshotKey;
	imageUrls: MarkdownImageUrls;
	position: number;
	step: CaseStep;
}

/** 只读的一组截图（操作截图或预期截图）：单元格文字下方的缩略图条和大图浏览。没有截图时不占位置。 */
export function StepScreenshotGallery({
	group,
	imageUrls,
	position,
	step,
}: StepScreenshotGalleryProps) {
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
