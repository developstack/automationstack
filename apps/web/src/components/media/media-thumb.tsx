import { Button } from "@automationstack/ui/components/button";
import { cn } from "@automationstack/ui/lib/utils";
import { Loader2Icon, PlayIcon } from "lucide-react";
import { type MouseEvent, useCallback } from "react";
import { HintTooltip } from "@/components/interaction/hint-tooltip";
import type {
	MediaItem,
	MediaOpenHandler,
} from "@/components/media/media-item";

/** 缩略图和「+N」共用的按钮样式：40×40，与「+」按钮同样大小。 */
export const MEDIA_THUMB_CLASS =
	"relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ThumbPreview({ item }: { item: MediaItem }) {
	if (item.url === null) {
		return null;
	}
	if (item.kind === "video") {
		return (
			<>
				<video
					aria-hidden="true"
					className="size-full object-cover"
					muted={true}
					preload="metadata"
					src={item.url}
					tabIndex={-1}
				/>
				<PlayIcon
					aria-hidden="true"
					className="absolute size-4 fill-background text-background drop-shadow"
				/>
			</>
		);
	}
	return (
		<img
			alt=""
			className="size-full object-cover"
			height={40}
			loading="lazy"
			src={item.url}
			width={40}
		/>
	);
}

interface MediaThumbProps {
	index: number;
	item: MediaItem;
	onOpen: MediaOpenHandler;
}

const STATUS_SUFFIX: Record<NonNullable<MediaItem["status"]>, string> = {
	failed: "（上传失败）",
	uploading: "（上传中）",
};

/** 一个缩略图：点击或按 Enter 打开大图浏览。录屏显示播放图标；上传中显示转圈，上传失败显示红框。 */
export function MediaThumb({ index, item, onOpen }: MediaThumbProps) {
	const open = useCallback(
		(event: MouseEvent<HTMLButtonElement>) =>
			onOpen(index, event.currentTarget),
		[index, onOpen]
	);
	return (
		<HintTooltip label={item.name}>
			<Button
				aria-label={`查看${item.name}${item.status === undefined ? "" : STATUS_SUFFIX[item.status]}`}
				className={cn(
					MEDIA_THUMB_CLASS,
					item.status === "failed" && "border-destructive"
				)}
				onClick={open}
				type="button"
				variant="plain"
			>
				<ThumbPreview item={item} />
				{item.status === "uploading" ? (
					<span className="absolute inset-0 flex items-center justify-center bg-background/60">
						<Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
					</span>
				) : null}
			</Button>
		</HintTooltip>
	);
}
