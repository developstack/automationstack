import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@automationstack/ui/components/dialog";
import {
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useState,
} from "react";

import type { MediaItem } from "@/components/media/media-item";
import { MediaLightboxStage } from "@/components/media/media-lightbox-stage";
import { MediaView } from "@/components/media/media-view";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

export interface MediaLightboxProps {
	items: readonly MediaItem[];
	onClose: () => void;
	open: boolean;
	/** 当前文件的操作，例如编辑模式中的「删除」。显示在序号的右边。 */
	renderActions?: (item: MediaItem) => ReactNode;
	/** 关闭后接收焦点的元素，通常是被点击的缩略图。不传时回到打开前有焦点的元素。 */
	returnFocusTo?: HTMLElement | null;
	/** 打开时显示的文件序号，从 0 开始。 */
	startIndex: number;
	/** 弹窗的标题，写明这一组文件，例如「第 2 步 · 操作截图」。序号显示在图片下方。 */
	titlePrefix: string;
}

const ARROW_DELTA: Record<string, number | undefined> = {
	ArrowLeft: -1,
	ArrowRight: 1,
};

function clampIndex(index: number, count: number): number {
	return Math.min(Math.max(index, 0), Math.max(count - 1, 0));
}

/**
 * 当前文件的序号：打开时从 startIndex 开始，在第一个和最后一个停止。
 */
function useLightboxIndex(open: boolean, startIndex: number, count: number) {
	const [index, setIndex] = useState(() => clampIndex(startIndex, count));

	// 只在打开时回到 startIndex。文件被删除时不重置，序号在渲染时限制在范围内。
	useEffect(() => {
		if (open) {
			setIndex(startIndex);
		}
	}, [open, startIndex]);

	const move = useCallback(
		(delta: number) =>
			setIndex((current) =>
				clampIndex(clampIndex(current, count) + delta, count)
			),
		[count]
	);
	const previous = useCallback(() => move(-1), [move]);
	const next = useCallback(() => move(1), [move]);

	return { index: clampIndex(index, count), move, next, previous };
}

/** ← 和 → 切换。焦点在录屏上时，← 和 → 留给播放控件快进和快退。 */
function useLightboxKeys(onMove: (delta: number) => void) {
	return useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			const delta = ARROW_DELTA[event.key];
			if (delta === undefined || event.target instanceof HTMLVideoElement) {
				return;
			}
			event.preventDefault();
			onMove(delta);
		},
		[onMove]
	);
}

/** 图片下方：中间是序号，例如「2 / 5」；右边是当前文件的操作。 */
function LightboxFooter({
	children,
	count,
	index,
}: {
	children: ReactNode;
	count: number;
	index: number;
}) {
	return (
		<div className="relative flex min-h-7 items-center justify-center">
			<p aria-live="polite" className="numeric text-muted-foreground text-xs">
				{`${index + 1} / ${count}`}
			</p>
			<div className="absolute right-0 flex items-center">{children}</div>
		</div>
	);
}

/**
 * 在弹窗中放大显示一组文件中的一个。标题写明这一组，图片两边是切换按钮，下方是序号。
 * ← 和 → 切换，Esc 关闭。
 * 焦点留在弹窗中，关闭后回到 returnFocusTo。文件被删除后停在原来的位置（删除最后一个时向前一个）；没有文件时弹窗关闭。
 */
export function MediaLightbox({
	items,
	onClose,
	open,
	renderActions,
	returnFocusTo,
	startIndex,
	titlePrefix,
}: MediaLightboxProps) {
	const count = items.length;
	const lightbox = useLightboxIndex(open, startIndex, count);
	const handleOpenChange = useCloseOnDismiss(onClose);
	// 最后一个文件被删除后关闭，否则以后加入文件时弹窗会自己打开
	useEffect(() => {
		if (open && count === 0) {
			onClose();
		}
	}, [count, onClose, open]);
	const finalFocus = useCallback(() => returnFocusTo ?? true, [returnFocusTo]);
	const item = items[lightbox.index];
	const handleKeyDown = useLightboxKeys(lightbox.move);

	return (
		<Dialog onOpenChange={handleOpenChange} open={open && item !== undefined}>
			<DialogContent
				className="gap-4 sm:max-w-4xl"
				finalFocus={finalFocus}
				onKeyDown={handleKeyDown}
			>
				<div className="flex flex-col gap-1 pr-8">
					<DialogTitle className="truncate">{titlePrefix}</DialogTitle>
					<DialogDescription className="text-xs">
						← 和 → 切换，Esc 关闭
					</DialogDescription>
				</div>
				<MediaLightboxStage
					count={count}
					index={lightbox.index}
					onNext={lightbox.next}
					onPrevious={lightbox.previous}
				>
					{item === undefined ? null : <MediaView item={item} key={item.id} />}
				</MediaLightboxStage>
				<LightboxFooter count={count} index={lightbox.index}>
					{item === undefined ? null : renderActions?.(item)}
				</LightboxFooter>
			</DialogContent>
		</Dialog>
	);
}
