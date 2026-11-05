import { Button } from "@automationstack/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@automationstack/ui/components/dialog";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useState,
} from "react";

import type { MediaItem } from "@/components/media/media-item";
import { MediaView } from "@/components/media/media-view";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

export interface MediaLightboxProps {
	items: readonly MediaItem[];
	onClose: () => void;
	open: boolean;
	/** 当前文件的操作，例如编辑模式中的「删除」。显示在切换按钮的右边。 */
	renderActions?: (item: MediaItem) => ReactNode;
	/** 关闭后接收焦点的元素，通常是被点击的缩略图。不传时回到打开前有焦点的元素。 */
	returnFocusTo?: HTMLElement | null;
	/** 打开时显示的文件序号，从 0 开始。 */
	startIndex: number;
	/** 标题的前一部分，后面接「序号/总数」，例如「第 2 步 · 操作截图」显示为「第 2 步 · 操作截图 2/5」。 */
	titlePrefix: string;
}

const ARROW_DELTA: Record<string, number | undefined> = {
	ArrowLeft: -1,
	ArrowRight: 1,
};

function clampIndex(index: number, count: number): number {
	return Math.min(Math.max(index, 0), Math.max(count - 1, 0));
}

interface LightboxNavProps {
	count: number;
	index: number;
	onNext: () => void;
	onPrevious: () => void;
}

function LightboxNav({ count, index, onNext, onPrevious }: LightboxNavProps) {
	return (
		<div className="flex items-center gap-2">
			<Button
				aria-label="上一个"
				disabled={index === 0}
				onClick={onPrevious}
				size="icon-sm"
				type="button"
				variant="outline"
			>
				<ChevronLeftIcon />
			</Button>
			<Button
				aria-label="下一个"
				disabled={index >= count - 1}
				onClick={onNext}
				size="icon-sm"
				type="button"
				variant="outline"
			>
				<ChevronRightIcon />
			</Button>
		</div>
	);
}

/**
 * 当前文件的序号：打开时从 startIndex 开始，← 和 → 切换，在第一个和最后一个停止。
 * 焦点在录屏上时，← 和 → 留给播放控件快进和快退。
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

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			const delta = ARROW_DELTA[event.key];
			if (delta === undefined || event.target instanceof HTMLVideoElement) {
				return;
			}
			event.preventDefault();
			move(delta);
		},
		[move]
	);

	return { handleKeyDown, index: clampIndex(index, count), next, previous };
}

/**
 * 在弹窗中放大显示一组文件中的一个，标题写明这一组和序号。← 和 → 切换，Esc 关闭。
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

	return (
		<Dialog onOpenChange={handleOpenChange} open={open && item !== undefined}>
			<DialogContent
				className="gap-4 sm:max-w-4xl"
				finalFocus={finalFocus}
				onKeyDown={lightbox.handleKeyDown}
			>
				<div className="flex flex-col gap-1 pr-8">
					<DialogTitle aria-live="polite" className="numeric truncate">
						{`${titlePrefix} ${lightbox.index + 1}/${count}`}
					</DialogTitle>
					<DialogDescription className="text-xs">
						← 和 → 切换，Esc 关闭
					</DialogDescription>
				</div>
				{item === undefined ? null : <MediaView item={item} key={item.id} />}
				<div className="flex items-center justify-between gap-2">
					<LightboxNav
						count={count}
						index={lightbox.index}
						onNext={lightbox.next}
						onPrevious={lightbox.previous}
					/>
					{item === undefined ? null : renderActions?.(item)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
