import type { AttachmentListItem } from "@/components/test-runs/attachment-list";

const IMAGE_HEIGHT_CLASS = "h-40";

export function isViewableImage(item: AttachmentListItem): boolean {
	return item.attachment.contentType.startsWith("image/") && item.url !== null;
}

interface GalleryItemProps {
	fileName: string;
	url: string;
}

function GalleryItem({ fileName, url }: GalleryItemProps) {
	return (
		<li className="flex flex-col items-start gap-1">
			<a href={url} rel="noopener" target="_blank">
				{/* biome-ignore lint/correctness/useImageSize: 附件表里没有像素尺寸——它只存 contentType/sizeBytes（服务端 HeadObject 读回来的），先例见 image-node.tsx。猜一个宽高会给出错误的宽高比，图会先按错的比例撑开再跳回去，比不填更糟。这里用 h-40 把高度钉死，加载带来的位移只剩宽度那一维。 */}
				<img
					alt={fileName}
					className={`${IMAGE_HEIGHT_CLASS} w-auto max-w-full rounded-md object-contain outline outline-black/10 dark:outline-white/10`}
					loading="lazy"
					src={url}
				/>
			</a>
		</li>
	);
}

export interface AttachmentGalleryProps {
	items: readonly AttachmentListItem[];
}

/** 只读的图片附件：点击在新标签页中打开原图。 */
export function AttachmentGallery({ items }: AttachmentGalleryProps) {
	if (items.length === 0) {
		return null;
	}
	return (
		<ul className="flex flex-wrap items-start gap-2">
			{items.map(({ attachment, url }) => (
				<GalleryItem
					fileName={attachment.fileName}
					key={attachment.id}
					url={url ?? ""}
				/>
			))}
		</ul>
	);
}
