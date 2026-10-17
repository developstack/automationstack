import { Button } from "@automationstack/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@automationstack/ui/components/dialog";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useState } from "react";

import {
	IMAGE_NOTICE_CLASS,
	LoadingImage,
} from "@/components/interaction/loading-image";

export interface LightboxImage {
	fileName: string;
	/** 图片的地址。地址还没有准备好或者无法签发时为 null。 */
	url: string | null;
}

export interface ImageLightboxProps {
	images: readonly LightboxImage[];
	onClose: () => void;
	open: boolean;
	/** 关闭后接收焦点的元素，通常是被点击的缩略图。不传时回到打开前有焦点的元素。 */
	returnFocusTo?: HTMLElement | null;
	/** 打开时显示的图片序号，从 0 开始。 */
	startIndex: number;
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
		<div className="flex items-center justify-center gap-3">
			<Button
				aria-label="上一张"
				disabled={index === 0}
				onClick={onPrevious}
				size="icon-sm"
				type="button"
				variant="outline"
			>
				<ChevronLeftIcon />
			</Button>
			<span aria-live="polite" className="numeric text-muted-foreground">
				{`${index + 1} / ${count}`}
			</span>
			<Button
				aria-label="下一张"
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

function LightboxImageView({ image }: { image: LightboxImage }) {
	if (image.url === null) {
		return <p className={IMAGE_NOTICE_CLASS}>图片暂时无法显示</p>;
	}
	return (
		<LoadingImage fileName={image.fileName} key={image.url} url={image.url} />
	);
}

/** 当前图片的序号：打开时从 startIndex 开始，← 和 → 切换，在第一张和最后一张停止。 */
function useLightboxIndex(
	props: Pick<ImageLightboxProps, "onClose" | "open" | "startIndex">,
	count: number
) {
	const { onClose, open, startIndex } = props;
	const [index, setIndex] = useState(() => clampIndex(startIndex, count));

	useEffect(() => {
		if (open) {
			setIndex(clampIndex(startIndex, count));
		}
	}, [count, open, startIndex]);

	const step = useCallback(
		(delta: number) =>
			setIndex((current) => clampIndex(current + delta, count)),
		[count]
	);
	const previous = useCallback(() => step(-1), [step]);
	const next = useCallback(() => step(1), [step]);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			const delta = ARROW_DELTA[event.key];
			if (delta !== undefined) {
				event.preventDefault();
				step(delta);
			}
		},
		[step]
	);
	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (!nextOpen) {
				onClose();
			}
		},
		[onClose]
	);

	return {
		handleKeyDown,
		handleOpenChange,
		index: clampIndex(index, count),
		next,
		previous,
	};
}

/**
 * 在弹窗中放大显示一组图片中的一张。← 和 → 切换图片，Esc 关闭。
 * 焦点留在弹窗中，关闭后回到 returnFocusTo。
 */
export function ImageLightbox(props: ImageLightboxProps) {
	const { images, open, returnFocusTo } = props;
	const count = images.length;
	const lightbox = useLightboxIndex(props, count);
	const finalFocus = useCallback(() => returnFocusTo ?? true, [returnFocusTo]);
	const image = images[lightbox.index];

	return (
		<Dialog
			onOpenChange={lightbox.handleOpenChange}
			open={open && image !== undefined}
		>
			<DialogContent
				className="gap-4 sm:max-w-4xl"
				finalFocus={finalFocus}
				onKeyDown={lightbox.handleKeyDown}
			>
				<div className="flex flex-col gap-1 pr-8">
					<DialogTitle className="truncate">{image?.fileName}</DialogTitle>
					<DialogDescription className="text-xs">
						← 和 → 切换图片，Esc 关闭
					</DialogDescription>
				</div>
				{image === undefined ? null : <LightboxImageView image={image} />}
				<LightboxNav
					count={count}
					index={lightbox.index}
					onNext={lightbox.next}
					onPrevious={lightbox.previous}
				/>
			</DialogContent>
		</Dialog>
	);
}
