import { cn } from "@automationstack/ui/lib/utils";
import { Loader2Icon } from "lucide-react";
import { useCallback } from "react";

import { ScreenshotRemoveButton } from "@/components/cases/screenshot-remove-button";
import { ScreenshotThumbButton } from "@/components/cases/screenshot-thumb-button";
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

function ThumbUploading() {
	return (
		<span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-background/60">
			<Loader2Icon aria-label="上传中" className="size-4 animate-spin" />
		</span>
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
	const remove = useCallback(() => onRemove(shot.id), [onRemove, shot.id]);
	const failed = shot.status === "failed";
	return (
		<li className="group relative" title={shot.error ?? shot.fileName}>
			<ScreenshotThumbButton
				className={cn(failed && "border-destructive")}
				fileName={shot.fileName}
				index={index}
				onOpen={onOpen}
				url={shot.url}
			/>
			{shot.status === "uploading" ? <ThumbUploading /> : null}
			{failed ? (
				<StepScreenshotFailure
					onRemove={onRemove}
					onRetry={onRetry}
					shot={shot}
				/>
			) : null}
			<ScreenshotRemoveButton onClick={remove} />
		</li>
	);
}
