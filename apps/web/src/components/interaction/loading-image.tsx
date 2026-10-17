import { cn } from "@automationstack/ui/lib/utils";
import { useCallback, useState } from "react";

export const IMAGE_NOTICE_CLASS =
	"flex h-40 items-center justify-center rounded-lg border border-dashed text-muted-foreground";

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

/**
 * 原图可能很大。异步解码使弹窗立即打开；图片加载完成前显示「图片加载中」。
 * 调用方用图片地址作为 key，切换图片时加载状态重新开始。
 */
export function LoadingImage({
	fileName,
	url,
}: {
	fileName: string;
	url: string;
}) {
	const { handleError, handleLoad, imageRef, state } = useImageLoadState();
	if (state === "error") {
		return <p className={IMAGE_NOTICE_CLASS}>图片暂时无法显示</p>;
	}
	const loaded = state === "loaded";
	return (
		<div aria-busy={!loaded} className="relative min-h-40">
			{loaded ? null : (
				<p className={cn(IMAGE_NOTICE_CLASS, "absolute inset-0 border-none")}>
					图片加载中
				</p>
			)}
			{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: onLoad 和 onError 是图片的加载事件，不是用户操作，所以不需要交互语义 */}
			<img
				alt={fileName}
				className={cn(
					"mx-auto max-h-160 w-auto max-w-full rounded-lg object-contain transition-opacity duration-150",
					loaded ? "opacity-100" : "opacity-0"
				)}
				data-loaded={loaded}
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
