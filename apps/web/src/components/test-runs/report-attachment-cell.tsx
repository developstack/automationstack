import { Button } from "@automationstack/ui/components/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@automationstack/ui/components/popover";
import { ImageIcon } from "lucide-react";

import type { AttachmentListItem } from "@/components/test-runs/attachment-list";

const NO_ATTACHMENT = "无";

function AttachmentLinks({ items }: { items: readonly AttachmentListItem[] }) {
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
	caseName: string;
	/** 整条用例的附件：自动化上传、以前人工上传的附件，以及已删除步骤的实际附件。 */
	items: readonly AttachmentListItem[];
}

/** 整条用例的附件数量，点击后列出文件链接。附件随报告一起加载，不另外请求。 */
export function AttachmentCell({ caseName, items }: AttachmentCellProps) {
	const attachmentCount = items.length;

	if (attachmentCount === 0) {
		return <span className="text-muted-foreground">{NO_ATTACHMENT}</span>;
	}

	return (
		<Popover>
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
				<AttachmentLinks items={items} />
			</PopoverContent>
		</Popover>
	);
}
