import { Button } from "@automationstack/ui/components/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@automationstack/ui/components/popover";
import { ImageIcon } from "lucide-react";
import { useState } from "react";

import { useAttachmentList } from "@/components/test-runs/use-attachment-upload";

const NO_ATTACHMENT = "无";

type AttachmentItems = ReturnType<typeof useAttachmentList>["data"];

function AttachmentList({
	isPending,
	items,
}: {
	isPending: boolean;
	items: AttachmentItems;
}) {
	if (isPending) {
		return <p className="text-muted-foreground text-sm">正在加载附件…</p>;
	}
	if (items === undefined || items.length === 0) {
		return <p className="text-muted-foreground text-sm">这条用例没有附件。</p>;
	}
	return (
		<ul className="flex flex-col gap-2">
			{items.map(({ attachment, url }) => (
				<li key={attachment.id}>
					{url === null ? (
						<span className="text-muted-foreground text-sm">
							{`${attachment.fileName}（附件存储未配置，暂不可访问）`}
						</span>
					) : (
						<a
							className="text-sm underline underline-offset-2"
							href={url}
							rel="noopener"
							target="_blank"
						>
							{attachment.fileName}
						</a>
					)}
				</li>
			))}
		</ul>
	);
}

export interface AttachmentCellProps {
	attachmentCount: number;
	caseName: string;
	runCaseId: string;
}

export function AttachmentCell({
	attachmentCount,
	caseName,
	runCaseId,
}: AttachmentCellProps) {
	const [open, setOpen] = useState(false);
	const { data, isPending } = useAttachmentList(open ? runCaseId : undefined);

	if (attachmentCount === 0) {
		return <span className="text-muted-foreground">{NO_ATTACHMENT}</span>;
	}

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger
				render={
					<Button
						aria-label={`查看「${caseName}」的 ${attachmentCount} 个附件`}
						size="sm"
						type="button"
						variant="ghost"
					>
						<ImageIcon data-icon="inline-start" />
						<span className="tabular-nums">{attachmentCount}</span>
					</Button>
				}
			/>
			<PopoverContent className="w-72">
				<AttachmentList isPending={isPending} items={data} />
			</PopoverContent>
		</Popover>
	);
}
