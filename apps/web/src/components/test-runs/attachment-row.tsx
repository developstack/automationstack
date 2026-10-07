import { Button } from "@automationstack/ui/components/button";
import { ImageIcon, PaperclipIcon, Trash2Icon } from "lucide-react";
import { useCallback } from "react";

const BYTES_PER_KIB = 1024;
const THUMBNAIL_PX = 40;

function formatSize(bytes: number): string {
	if (bytes < BYTES_PER_KIB) {
		return `${bytes} B`;
	}
	const kib = bytes / BYTES_PER_KIB;
	if (kib < BYTES_PER_KIB) {
		return `${Math.round(kib)} KB`;
	}
	return `${(kib / BYTES_PER_KIB).toFixed(1)} MB`;
}

interface AttachmentThumbnailProps {
	contentType: string;
	fileName: string;
	url: string | null;
}

function AttachmentThumbnail({
	contentType,
	fileName,
	url,
}: AttachmentThumbnailProps) {
	const isImage = contentType.startsWith("image/");

	if (isImage && url !== null) {
		return (
			<img
				alt={`附件 ${fileName} 的缩略图`}
				className="size-10 shrink-0 rounded object-cover outline outline-black/10 dark:outline-white/10"
				height={THUMBNAIL_PX}
				src={url}
				width={THUMBNAIL_PX}
			/>
		);
	}
	return (
		<span className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
			{isImage ? (
				<ImageIcon aria-hidden="true" className="size-4" />
			) : (
				<PaperclipIcon aria-hidden="true" className="size-4" />
			)}
		</span>
	);
}

interface AttachmentRowActionsProps {
	fileName: string;
	onRemove: () => void;
	removable: boolean;
	url: string | null;
}

function AttachmentRowActions({
	fileName,
	onRemove,
	removable,
	url,
}: AttachmentRowActionsProps) {
	return (
		<>
			{url !== null && (
				<Button
					render={<a href={url} rel="noopener" target="_blank" />}
					variant="ghost"
				>
					打开
				</Button>
			)}
			{removable ? (
				<Button
					aria-label={`删除附件 ${fileName}`}
					onClick={onRemove}
					type="button"
					variant="ghost"
				>
					<Trash2Icon aria-hidden="true" />
				</Button>
			) : null}
		</>
	);
}

interface AttachmentRowProps {
	contentType: string;
	fileName: string;
	id: string;
	onRemove: (id: string) => void;
	removable: boolean;
	sizeBytes: number;
	url: string | null;
}

export function AttachmentRow({
	contentType,
	fileName,
	id,
	onRemove,
	removable,
	sizeBytes,
	url,
}: AttachmentRowProps) {
	const handleRemove = useCallback(() => onRemove(id), [id, onRemove]);

	return (
		<li className="flex items-center gap-2 rounded-md bg-card p-2">
			<AttachmentThumbnail
				contentType={contentType}
				fileName={fileName}
				url={url}
			/>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-sm" title={fileName}>
					{fileName}
				</span>
				<span className="text-muted-foreground text-xs">
					{formatSize(sizeBytes)}
					{url === null && " · 存储不可用，暂时打不开"}
				</span>
			</span>
			<AttachmentRowActions
				fileName={fileName}
				onRemove={handleRemove}
				removable={removable}
				url={url}
			/>
		</li>
	);
}
