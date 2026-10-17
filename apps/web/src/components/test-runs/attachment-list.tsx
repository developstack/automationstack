import { AttachmentRow } from "@/components/test-runs/attachment-row";

export interface AttachmentListItem {
	attachment: {
		contentType: string;
		fileName: string;
		id: string;
		sizeBytes: number;
	};
	url: string | null;
}

export interface AttachmentListProps {
	items: readonly AttachmentListItem[];
}

/** 只读的文件附件（录屏、日志等）：每行一个文件，可以在新标签页中打开。 */
export function AttachmentList({ items }: AttachmentListProps) {
	if (items.length === 0) {
		return null;
	}

	return (
		<ul className="flex flex-col gap-2">
			{items.map(({ attachment, url }) => (
				<AttachmentRow
					contentType={attachment.contentType}
					fileName={attachment.fileName}
					key={attachment.id}
					sizeBytes={attachment.sizeBytes}
					url={url}
				/>
			))}
		</ul>
	);
}
