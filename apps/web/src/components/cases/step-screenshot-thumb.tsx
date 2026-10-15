import { Button } from "@automationstack/ui/components/button";
import { cn } from "@automationstack/ui/lib/utils";
import { Loader2Icon, XIcon } from "lucide-react";
import { type MouseEvent, useCallback } from "react";

import { StepScreenshotFailure } from "@/components/cases/step-screenshot-failure";
import type { LocalScreenshotStatus } from "@/components/cases/use-step-screenshots";

/** 一张步骤截图的显示信息。已保存的截图没有本地状态，status 为 null。 */
export interface ScreenshotView {
	error: string | null;
	fileName: string;
	id: string;
	status: LocalScreenshotStatus | null;
	url: string | null;
}

interface StepScreenshotThumbProps {
	index: number;
	onOpen: (index: number, origin: HTMLElement) => void;
	onRemove: (id: string) => void;
	onRetry: (id: string) => void;
	shot: ScreenshotView;
}

const HOVER_REVEAL_CLASS =
	"opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100";

function ThumbUploading() {
	return (
		<span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-background/60">
			<Loader2Icon aria-label="上传中" className="size-4 animate-spin" />
		</span>
	);
}

function ThumbImage({ url }: { url: string | null }) {
	if (url === null) {
		return null;
	}
	return (
		<img
			alt=""
			className="size-full object-cover"
			height={90}
			src={url}
			width={120}
		/>
	);
}

/** 步骤截图的缩略图：120×90，点击放大；悬停或聚焦时显示删除按钮。 */
export function StepScreenshotThumb({
	index,
	onOpen,
	onRemove,
	onRetry,
	shot,
}: StepScreenshotThumbProps) {
	const open = useCallback(
		(event: MouseEvent<HTMLButtonElement>) =>
			onOpen(index, event.currentTarget),
		[index, onOpen]
	);
	const remove = useCallback(() => onRemove(shot.id), [onRemove, shot.id]);
	const failed = shot.status === "failed";
	return (
		<li className="group relative" title={shot.error ?? shot.fileName}>
			<button
				aria-label={`放大查看 ${shot.fileName}`}
				className={cn(
					"block h-22.5 w-30 overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring",
					failed && "border-destructive"
				)}
				onClick={open}
				type="button"
			>
				<ThumbImage url={shot.url} />
			</button>
			{shot.status === "uploading" ? <ThumbUploading /> : null}
			{failed ? (
				<StepScreenshotFailure
					onRemove={onRemove}
					onRetry={onRetry}
					shot={shot}
				/>
			) : null}
			<Button
				aria-label="删除截图"
				className={cn("absolute top-1 right-1", HOVER_REVEAL_CLASS)}
				onClick={remove}
				size="icon-xs"
				type="button"
				variant="secondary"
			>
				<XIcon />
			</Button>
		</li>
	);
}
