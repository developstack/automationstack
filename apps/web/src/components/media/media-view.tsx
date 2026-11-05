import { cn } from "@automationstack/ui/lib/utils";
import { useCallback, useState } from "react";

import type { MediaItem } from "@/components/media/media-item";

const NOTICE_CLASS =
	"flex h-40 items-center justify-center rounded-lg border border-dashed text-muted-foreground";

const UNAVAILABLE_TEXT = "图片暂时无法显示";

/** 地址无法签发时的提示，按文件的种类。 */
const UNAVAILABLE_TEXT_BY_KIND: Record<MediaItem["kind"], string> = {
	image: UNAVAILABLE_TEXT,
	video: "录屏暂时无法显示",
};

type ImageLoadState = "error" | "loaded" | "loading";

/**
 * 图片可能在 onLoad 和 onError 绑定前已经完成，例如缓存中的图片或缓存中的 404。
 * 所以挂载时也检查一次：完成并且有宽度表示加载成功，完成但没有宽度表示加载失败。
 */
function useImageLoadState() {
	const [state, setState] = useState<ImageLoadState>("loading");
	const handleLoad = useCallback(() => setState("loaded"), []);
	const handleError = useCallback(() => setState("error"), []);
	const imageRef = useCallback((node: HTMLImageElement | null) => {
		if (node?.complete) {
			setState(node.naturalWidth > 0 ? "loaded" : "error");
		}
	}, []);
	return { handleError, handleLoad, imageRef, state };
}

/** 原图可能很大。异步解码使弹窗立即打开；图片加载完成前显示「图片加载中」。 */
function LoadingImage({ name, url }: { name: string; url: string }) {
	const { handleError, handleLoad, imageRef, state } = useImageLoadState();
	if (state === "error") {
		return <p className={NOTICE_CLASS}>{UNAVAILABLE_TEXT}</p>;
	}
	const loaded = state === "loaded";
	return (
		<div aria-busy={!loaded} className="relative min-h-40">
			{loaded ? null : (
				<p className={cn(NOTICE_CLASS, "absolute inset-0 border-none")}>
					图片加载中
				</p>
			)}
			{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: onLoad 和 onError 是图片的加载事件，不是用户操作，所以不需要交互语义 */}
			<img
				alt={name}
				className={cn(
					"mx-auto max-h-160 w-auto max-w-full rounded-lg object-contain transition-opacity duration-150",
					loaded ? "opacity-100" : "opacity-0"
				)}
				decoding="async"
				height={600}
				onError={handleError}
				onLoad={handleLoad}
				ref={imageRef}
				src={url}
				width={800}
			/>
		</div>
	);
}

/**
 * 大图浏览中的一个文件：图片异步加载，录屏用浏览器的播放控件。
 * 调用方用文件的 id 作为 key，切换文件时加载状态重新开始。
 */
export function MediaView({ item }: { item: MediaItem }) {
	if (item.url === null) {
		return (
			<p className={NOTICE_CLASS}>{UNAVAILABLE_TEXT_BY_KIND[item.kind]}</p>
		);
	}
	if (item.kind === "video") {
		return (
			// biome-ignore lint/a11y/useMediaCaption: 录屏是测试过程的画面，没有对白，所以没有字幕
			<video
				aria-label={item.name}
				className="mx-auto max-h-160 w-auto max-w-full rounded-lg"
				controls={true}
				preload="metadata"
				src={item.url}
			/>
		);
	}
	return <LoadingImage name={item.name} url={item.url} />;
}
