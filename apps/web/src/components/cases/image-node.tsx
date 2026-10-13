import { cn } from "@automationstack/ui/lib/utils";
import type { ReactElement } from "react";

import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";

const PLACEHOLDER_CLASS =
	"my-1 flex h-24 w-full max-w-xs items-center justify-center rounded-md border border-dashed text-muted-foreground text-xs";

function ImagePending({ pending }: { pending: boolean }): ReactElement {
	return (
		<span className={PLACEHOLDER_CLASS}>
			{pending ? "图片上传中…" : "图片加载中"}
		</span>
	);
}

function ImageUnavailable(): ReactElement {
	return (
		<span className={PLACEHOLDER_CLASS}>附件存储未配置，图片无法显示</span>
	);
}

export function ImageNode({
	attachmentId,
	imageUrls,
	pending,
}: {
	attachmentId: string;
	imageUrls: MarkdownImageUrls | undefined;
	pending: boolean;
}): ReactElement {
	const url = imageUrls?.get(attachmentId);
	if (url === undefined) {
		return <ImagePending pending={pending} />;
	}
	if (url === null) {
		return <ImageUnavailable />;
	}
	return (
		// biome-ignore lint/correctness/useImageSize: 我们没有这张图的宽高——附件表只存 contentType/sizeBytes（服务端 HeadObject 读回来的），拿不到像素尺寸。填一个猜的宽高会给出错误的宽高比，那比不填更糟：图会先按错误比例撑开再跳回真实比例。上方的占位块已经预留了固定高度，把加载期的位移限制在「占位高度 → 真实高度」这一次。
		<img
			alt={pending ? "用例插图（上传中）" : "用例插图"}
			className={cn(
				"my-1 block h-auto max-w-full rounded-md border",
				pending && "opacity-60"
			)}
			loading="lazy"
			src={url}
		/>
	);
}
