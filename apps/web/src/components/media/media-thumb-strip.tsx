import { Button } from "@automationstack/ui/components/button";
import { type MouseEvent, type ReactNode, useCallback } from "react";

import type {
	MediaItem,
	MediaOpenHandler,
} from "@/components/media/media-item";
import { MEDIA_THUMB_CLASS, MediaThumb } from "@/components/media/media-thumb";

/** 缩略图条默认最多显示的缩略图数量，多出来的显示「+N」。 */
export const DEFAULT_VISIBLE_THUMBS = 3;

export interface MediaThumbStripProps {
	/** 放在缩略图后面的列表项（<li>），例如编辑模式中的「+」按钮。 */
	children?: ReactNode;
	items: readonly MediaItem[];
	/** 缩略图列表的无障碍名称，例如「第 2 步操作截图」。 */
	label: string;
	maxVisible?: number;
	onOpen: MediaOpenHandler;
}

function MoreButton({
	from,
	hidden,
	onOpen,
}: {
	from: number;
	hidden: number;
	onOpen: MediaOpenHandler;
}) {
	const open = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => onOpen(from, event.currentTarget),
		[from, onOpen]
	);
	return (
		<Button
			aria-label={`查看另外 ${hidden} 个`}
			className={`${MEDIA_THUMB_CLASS} numeric text-muted-foreground text-xs`}
			onClick={open}
			type="button"
			variant="plain"
		>
			{`+${hidden}`}
		</Button>
	);
}

/**
 * 固定高度的缩略图条：40×40 的缩略图，最多显示 maxVisible 个，多出来的显示「+N」，
 * 点「+N」从第一个没有显示的文件打开大图浏览。没有文件也没有 children 时不显示，不占位置。
 */
export function MediaThumbStrip({
	children,
	items,
	label,
	maxVisible = DEFAULT_VISIBLE_THUMBS,
	onOpen,
}: MediaThumbStripProps) {
	if (items.length === 0 && !children) {
		return null;
	}
	const visible = items.slice(0, maxVisible);
	const hidden = items.length - visible.length;
	return (
		<ul aria-label={label} className="flex h-10 items-center gap-1.5">
			{visible.map((item, index) => (
				<li key={item.id}>
					<MediaThumb index={index} item={item} onOpen={onOpen} />
				</li>
			))}
			{hidden > 0 ? (
				<li>
					<MoreButton from={maxVisible} hidden={hidden} onOpen={onOpen} />
				</li>
			) : null}
			{children}
		</ul>
	);
}
