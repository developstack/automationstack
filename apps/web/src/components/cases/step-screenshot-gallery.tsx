import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@automationstack/ui/components/alert-dialog";
import { cn } from "@automationstack/ui/lib/utils";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import { useCaseAttachments } from "@/components/cases/case-attachment-context";
import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { ScreenshotRemoveButton } from "@/components/cases/screenshot-remove-button";
import { ScreenshotThumbButton } from "@/components/cases/screenshot-thumb-button";
import { describeScreenshot } from "@/components/cases/step-screenshot-strip";
import type { ScreenshotView } from "@/components/cases/step-screenshot-thumb";
import { useScreenshotLightbox } from "@/components/cases/use-screenshot-lightbox";
import { ImageLightbox } from "@/components/interaction/image-lightbox";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

const NO_LOCAL_SHOTS = new Map();

export interface StepScreenshotGalleryProps {
	/** 缩略图左上角的标记，例如版本对比中截图的变化。 */
	badgeFor?: (id: string) => ReactNode;
	/** 缩略图列表的附加类名，例如外边距。 */
	className?: string;
	/** 步骤截图的附件 id，按显示的顺序。 */
	ids: readonly string[];
	imageUrls: MarkdownImageUrls;
	/** 缩略图列表的无障碍名称，例如「第 1 步截图」。 */
	label: string;
	/** 用户确认删除一张截图后调用。不传时不显示删除按钮。 */
	onRemove?: (id: string) => void;
	/** 删除正在保存时为 true，删除按钮不可用。 */
	removing?: boolean;
}

interface RemoveConfirmDialogProps {
	onCancel: () => void;
	onConfirm: () => void;
	open: boolean;
}

function RemoveConfirmDialog({
	onCancel,
	onConfirm,
	open,
}: RemoveConfirmDialogProps) {
	const handleOpenChange = useCloseOnDismiss(onCancel);
	return (
		<AlertDialog onOpenChange={handleOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>删除这张截图？</AlertDialogTitle>
					<AlertDialogDescription>
						删除后，用例保存为一个新版本。以前的版本仍然显示这张截图。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>取消</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm} variant="destructive">
						删除截图
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

interface GalleryThumbProps {
	badge: ReactNode;
	index: number;
	onAskRemove?: (id: string) => void;
	onOpen: (index: number, origin: HTMLElement) => void;
	removing: boolean;
	shot: ScreenshotView;
}

function GalleryThumb({
	badge,
	index,
	onAskRemove,
	onOpen,
	removing,
	shot,
}: GalleryThumbProps) {
	const askRemove = useCallback(
		() => onAskRemove?.(shot.id),
		[onAskRemove, shot.id]
	);
	return (
		<li className="group relative" title={shot.fileName}>
			<ScreenshotThumbButton
				fileName={shot.fileName}
				index={index}
				onOpen={onOpen}
				url={shot.url}
			/>
			{badge ? (
				<span className="pointer-events-none absolute top-1 left-1">
					{badge}
				</span>
			) : null}
			{onAskRemove ? (
				<ScreenshotRemoveButton disabled={removing} onClick={askRemove} />
			) : null}
		</li>
	);
}

/** 已保存的截图：文件名来自附件列表，没有登记的附件显示「截图」。 */
function useSavedScreenshotViews(
	ids: readonly string[],
	imageUrls: MarkdownImageUrls
): ScreenshotView[] {
	const { fileNames } = useCaseAttachments();
	return useMemo(
		() =>
			ids.map((id) =>
				describeScreenshot(id, { fileNames, imageUrls, shots: NO_LOCAL_SHOTS })
			),
		[fileNames, ids, imageUrls]
	);
}

function useRemoveConfirm(onRemove: ((id: string) => void) | undefined) {
	const [pendingId, setPendingId] = useState<string | null>(null);
	const cancel = useCallback(() => setPendingId(null), []);
	const confirm = useCallback(() => {
		if (pendingId !== null) {
			onRemove?.(pendingId);
		}
		setPendingId(null);
	}, [onRemove, pendingId]);
	return { ask: setPendingId, cancel, confirm, open: pendingId !== null };
}

/**
 * 只读的步骤截图：一行 120×90 的缩略图，超出宽度时换行。点击或按 Enter 放大查看，
 * 弹窗中可以切换这个步骤的所有截图。传入 onRemove 时，悬停或聚焦缩略图显示删除按钮，删除前要确认。
 * 没有截图时不显示。
 */
export function StepScreenshotGallery({
	badgeFor,
	className,
	ids,
	imageUrls,
	label,
	onRemove,
	removing = false,
}: StepScreenshotGalleryProps) {
	const lightbox = useScreenshotLightbox();
	const removal = useRemoveConfirm(onRemove);
	const views = useSavedScreenshotViews(ids, imageUrls);
	if (views.length === 0) {
		return null;
	}
	return (
		<>
			<ul aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
				{views.map((view, index) => (
					<GalleryThumb
						badge={badgeFor?.(view.id)}
						index={index}
						key={view.id}
						onAskRemove={onRemove ? removal.ask : undefined}
						onOpen={lightbox.open}
						removing={removing}
						shot={view}
					/>
				))}
			</ul>
			<ImageLightbox
				images={views}
				onClose={lightbox.close}
				open={lightbox.state !== null}
				returnFocusTo={lightbox.state?.origin}
				startIndex={lightbox.state?.index ?? 0}
			/>
			{onRemove ? (
				<RemoveConfirmDialog
					onCancel={removal.cancel}
					onConfirm={removal.confirm}
					open={removal.open}
				/>
			) : null}
		</>
	);
}
