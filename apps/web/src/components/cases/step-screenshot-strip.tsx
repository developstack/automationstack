import { Button } from "@automationstack/ui/components/button";
import { PlusIcon } from "lucide-react";
import { type ChangeEvent, useCallback, useId, useMemo, useRef } from "react";

import { useCaseAttachments } from "@/components/cases/case-attachment-context";
import {
	type ScreenshotView,
	StepScreenshotThumb,
} from "@/components/cases/step-screenshot-thumb";
import {
	isLocalScreenshot,
	SCREENSHOT_ACCEPT,
} from "@/components/cases/step-screenshots";
import { useScreenshotLightbox } from "@/components/cases/use-screenshot-lightbox";
import {
	SCREENSHOT_STORAGE_UNAVAILABLE,
	type StepScreenshotEdit,
} from "@/components/cases/use-step-screenshot-edit";
import type { LocalScreenshot } from "@/components/cases/use-step-screenshots";
import { ImageLightbox } from "@/components/interaction/image-lightbox";

const FALLBACK_FILE_NAME = "截图";

interface ScreenshotSources {
	fileNames: ReadonlyMap<string, string>;
	imageUrls: ReadonlyMap<string, string | null>;
	shots: ReadonlyMap<string, LocalScreenshot>;
}

export function describeScreenshot(
	id: string,
	sources: ScreenshotSources
): ScreenshotView {
	const local = isLocalScreenshot(id) ? sources.shots.get(id) : undefined;
	if (local !== undefined) {
		return {
			error: local.error,
			fileName: local.file.name || FALLBACK_FILE_NAME,
			id,
			status: local.status,
			url: local.url,
		};
	}
	return {
		error: null,
		fileName: sources.fileNames.get(id) ?? FALLBACK_FILE_NAME,
		id,
		status: null,
		url: sources.imageUrls.get(id) ?? null,
	};
}

function useFilePicker(onAdd: (files: File[]) => void) {
	const inputRef = useRef<HTMLInputElement>(null);
	const pick = useCallback(() => inputRef.current?.click(), []);
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			const files = [...(event.target.files ?? [])];
			event.target.value = "";
			if (files.length > 0) {
				onAdd(files);
			}
		},
		[onAdd]
	);
	return { handleChange, inputRef, pick };
}

interface AddScreenshotButtonProps {
	available: boolean;
	onAdd: (files: File[]) => void;
	position: number;
}

function AddScreenshotButton({
	available,
	onAdd,
	position,
}: AddScreenshotButtonProps) {
	const picker = useFilePicker(onAdd);
	const reasonId = useId();
	return (
		<li className="flex items-center gap-2">
			<Button
				aria-describedby={available ? undefined : reasonId}
				aria-label="添加截图"
				className="border-dashed"
				disabled={!available}
				onClick={picker.pick}
				size="icon-sm"
				title={available ? `给第 ${position} 步添加截图` : undefined}
				type="button"
				variant="outline"
			>
				<PlusIcon />
			</Button>
			{available ? null : (
				<span className="text-muted-foreground text-xs" id={reasonId}>
					{SCREENSHOT_STORAGE_UNAVAILABLE}
				</span>
			)}
			<input
				accept={SCREENSHOT_ACCEPT}
				aria-hidden="true"
				className="hidden"
				multiple={true}
				onChange={picker.handleChange}
				ref={picker.inputRef}
				tabIndex={-1}
				type="file"
			/>
		</li>
	);
}

export interface StepScreenshotStripProps {
	edit: StepScreenshotEdit;
	ids: readonly string[];
	position: number;
}

function useScreenshotViews(ids: readonly string[]): ScreenshotView[] {
	const { fileNames, imageUrls, screenshots: store } = useCaseAttachments();
	const shots = store?.shots;
	return useMemo(
		() =>
			ids.map((id) =>
				describeScreenshot(id, {
					fileNames,
					imageUrls,
					shots: shots ?? new Map(),
				})
			),
		[fileNames, ids, imageUrls, shots]
	);
}

/** 步骤输入框下面的步骤截图：缩略图、「+」按钮和放大查看的弹窗。 */
export function StepScreenshotStrip({
	edit,
	ids,
	position,
}: StepScreenshotStripProps) {
	const { screenshots: store } = useCaseAttachments();
	const lightbox = useScreenshotLightbox();
	const views = useScreenshotViews(ids);
	if (store === null || edit.addFiles === undefined) {
		return null;
	}
	return (
		<div className="sm:col-span-2 sm:col-start-2">
			<ul aria-label={`第 ${position} 步截图`} className="flex flex-wrap gap-2">
				{views.map((view, index) => (
					<StepScreenshotThumb
						index={index}
						key={view.id}
						onOpen={lightbox.open}
						onRemove={edit.remove}
						onRetry={store.retry}
						shot={view}
					/>
				))}
				<AddScreenshotButton
					available={store.available}
					onAdd={edit.addFiles}
					position={position}
				/>
			</ul>
			<ImageLightbox
				images={views}
				onClose={lightbox.close}
				open={lightbox.state !== null}
				returnFocusTo={lightbox.state?.origin}
				startIndex={lightbox.state?.index ?? 0}
			/>
		</div>
	);
}
