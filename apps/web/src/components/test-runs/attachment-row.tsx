import { buttonVariants } from "@automationstack/ui/components/button";
import { ImageIcon, PaperclipIcon } from "lucide-react";
import { TruncatedText } from "@/components/interaction/truncated-text";

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

/** 打开附件的链接。存储不可用时没有地址，不显示。 */
function AttachmentOpenLink({ url }: { url: string | null }) {
	if (url === null) {
		return null;
	}
	return (
		<a
			className={buttonVariants({ variant: "ghost" })}
			href={url}
			rel="noopener"
			target="_blank"
		>
			打开
		</a>
	);
}

interface AttachmentRowProps {
	contentType: string;
	fileName: string;
	sizeBytes: number;
	url: string | null;
}

/** 只读的一行附件：缩略图、文件名、大小和「打开」。 */
export function AttachmentRow({
	contentType,
	fileName,
	sizeBytes,
	url,
}: AttachmentRowProps) {
	return (
		<li className="flex items-center gap-2 rounded-md bg-card p-2">
			<AttachmentThumbnail
				contentType={contentType}
				fileName={fileName}
				url={url}
			/>
			<span className="min-w-0 flex-1">
				<TruncatedText className="block text-sm" text={fileName} />
				<span className="text-muted-foreground text-xs">
					{formatSize(sizeBytes)}
					{url === null && " · 存储不可用，暂时打不开"}
				</span>
			</span>
			<AttachmentOpenLink url={url} />
		</li>
	);
}
