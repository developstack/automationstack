import type { ReactNode } from "react";

import type { MediaItem } from "@/components/media/media-item";
import { MediaLightbox } from "@/components/media/media-lightbox";
import { MediaThumbStrip } from "@/components/media/media-thumb-strip";
import { useMediaLightbox } from "@/components/media/use-media-lightbox";

export interface MediaGalleryProps {
	/** 放在缩略图后面的列表项（<li>），例如编辑模式中的「+」按钮。 */
	children?: ReactNode;
	items: readonly MediaItem[];
	/** 缩略图列表的无障碍名称，例如「第 2 步操作截图」。 */
	label: string;
	maxVisible?: number;
	/** 大图浏览中当前文件的操作，例如编辑模式中的「删除」。 */
	renderActions?: (item: MediaItem) => ReactNode;
	/** 大图浏览标题的前一部分，例如「第 2 步 · 操作截图」。 */
	titlePrefix: string;
}

/** 一组图片或录屏：缩略图条，点缩略图或「+N」打开这一组的大图浏览。没有文件也没有 children 时不占位置。 */
export function MediaGallery({
	children,
	items,
	label,
	maxVisible,
	renderActions,
	titlePrefix,
}: MediaGalleryProps) {
	const lightbox = useMediaLightbox();
	return (
		<>
			<MediaThumbStrip
				items={items}
				label={label}
				maxVisible={maxVisible}
				onOpen={lightbox.open}
			>
				{children}
			</MediaThumbStrip>
			<MediaLightbox
				items={items}
				onClose={lightbox.close}
				open={lightbox.state !== null}
				renderActions={renderActions}
				returnFocusTo={lightbox.state?.origin}
				startIndex={lightbox.state?.index ?? 0}
				titlePrefix={titlePrefix}
			/>
		</>
	);
}
