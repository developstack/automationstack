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
	onRemove: (id: string) => void;
	removable: boolean;
}

export function AttachmentList({
	items,
	onRemove,
	removable,
}: AttachmentListProps) {
	if (items.length === 0) {
		return null;
	}

	return (
		<ul className="flex flex-col gap-2">
			{items.map(({ attachment, url }) => (
				<AttachmentRow
					contentType={attachment.contentType}
					fileName={attachment.fileName}
					id={attachment.id}
					key={attachment.id}
					onRemove={onRemove}
					removable={removable}
					sizeBytes={attachment.sizeBytes}
					url={url}
				/>
			))}
		</ul>
	);
}
