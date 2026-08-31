/**
 * 执行者传上来的图，直接摊在结果里。
 *
 * 用户已经两次说不要「附件」那个模块（原话：「附件不是都跟你说了，用户有贴图就
 * 显示，没贴图就不要显示了。直接显示在结果里面，为什么还要做一个附件这个模块
 * 呢？」）。所以图就是图：贴了就看得见，没贴什么都没有，不留标题也不留空框。
 *
 * 与 `attachment-list.tsx` 那份 40px 缩略图列表并存而不是取代它：**图能看，
 * 别的看不了**。录屏、日志、zip 只有文件名与大小可读，摊成大图块毫无意义，
 * 那些仍然走列表行。分流在 `isViewableImage` 上，两边加起来正好是全集。
 */
import { Button } from "@automationstack/ui/components/button";
import { Trash2Icon } from "lucide-react";
import { useCallback } from "react";

import type { AttachmentListItem } from "@/components/test-runs/attachment-list";

/** 高度写死一档：图的原始尺寸后端没返回，钉住高度至少让它加载完不把下面顶走。 */
const IMAGE_HEIGHT_CLASS = "h-40";

/**
 * 能不能就这么显示出来。
 *
 * `url` 为 null = R2 没配置，后端仍会返回附件行——那种行没图可画，得回到列表里
 * 由「存储不可用，暂时打不开」那句话交代清楚，而不是渲染一个碎图标。
 */
export function isViewableImage(item: AttachmentListItem): boolean {
	return item.attachment.contentType.startsWith("image/") && item.url !== null;
}

interface GalleryItemProps {
	fileName: string;
	id: string;
	onRemove: (id: string) => void;
	removable: boolean;
	url: string;
}

function GalleryItem({
	fileName,
	id,
	onRemove,
	removable,
	url,
}: GalleryItemProps) {
	// useCallback 不是为了性能，是 Biome 的 noJsxPropsBind：内联箭头每次渲染都是新引用。
	const handleRemove = useCallback(() => onRemove(id), [id, onRemove]);

	return (
		<li className="flex flex-col items-start gap-1">
			{/*
			 * 包成链接：截图缩到 160px 高常常看不清报错文字，点开是新标签页里的原图。
			 * fileName 只做 alt 文本，**绝不参与 URL 拼接**——它是用户可控字符串。
			 */}
			<a href={url} rel="noopener" target="_blank">
				{/*
				 * 描边用纯黑/纯白 10%（outline，不是 border）：border 是主题色边框，会跟着
				 * 配色变；图片内容本身什么颜色都可能有，描边只用来跟底色分开，不该带自己
				 * 的色相——slate/zinc 之类的近黑同样不行，那仍是带色相的灰。
				 */}
				{/* biome-ignore lint/correctness/useImageSize: 附件表里没有像素尺寸——它只存 contentType/sizeBytes（服务端 HeadObject 读回来的），先例见 image-node.tsx。猜一个宽高会给出错误的宽高比，图会先按错的比例撑开再跳回去，比不填更糟。这里用 h-40 把高度钉死，加载带来的位移只剩宽度那一维。 */}
				<img
					alt={fileName}
					className={`${IMAGE_HEIGHT_CLASS} w-auto max-w-full rounded-md object-contain outline outline-black/10 dark:outline-white/10`}
					loading="lazy"
					src={url}
				/>
			</a>
			{removable ? (
				<Button
					aria-label={`删除附件 ${fileName}`}
					onClick={handleRemove}
					size="xs"
					type="button"
					variant="ghost"
				>
					<Trash2Icon aria-hidden="true" data-icon="inline-start" />
					删除
				</Button>
			) : null}
		</li>
	);
}

export interface AttachmentGalleryProps {
	items: readonly AttachmentListItem[];
	onRemove: (id: string) => void;
	/** 已提交的测试任务：只能看，不能删。 */
	removable: boolean;
}

export function AttachmentGallery({
	items,
	onRemove,
	removable,
}: AttachmentGalleryProps) {
	// 空列表整条不渲染，而不是渲染一个空 <ul>：高度为 0 的 <ul> 仍然算一个 flex
	// item，会在上下两块之间吃掉一份 gap，留出一道解释不了的空隙。
	if (items.length === 0) {
		return null;
	}
	return (
		<ul className="flex flex-wrap items-start gap-2">
			{items.map(({ attachment, url }) => (
				<GalleryItem
					fileName={attachment.fileName}
					id={attachment.id}
					key={attachment.id}
					onRemove={onRemove}
					removable={removable}
					// isViewableImage 已经挡掉了 null；?? "" 只是让类型收窄，走不到。
					url={url ?? ""}
				/>
			))}
		</ul>
	);
}
