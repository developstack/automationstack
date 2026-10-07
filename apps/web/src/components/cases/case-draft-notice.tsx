import { Button } from "@automationstack/ui/components/button";
import { HistoryIcon, TriangleAlertIcon } from "lucide-react";

import { formatDateTime } from "@/components/cases/case-meta";

export const DRAFT_BANNER_CLASS =
	"flex items-start gap-2 border-b bg-muted/40 px-4 py-2 text-muted-foreground text-xs";

interface CaseDraftNoticeProps {
	missing: boolean;
	onDiscard: () => void;
	restoredAt: number | null;
}

export function CaseDraftNotice({
	missing,
	onDiscard,
	restoredAt,
}: CaseDraftNoticeProps) {
	if (missing) {
		return (
			<div className={DRAFT_BANNER_CLASS} role="alert">
				<TriangleAlertIcon className="icon-stroke-regular mt-0.5 size-3.5 shrink-0" />
				<p className="flex-1">
					要继续编辑的那份草稿已经不在这台电脑上了（可能已经删掉，或者换了浏览器打开这个链接）。下面是一张空白的新建表单。
				</p>
			</div>
		);
	}

	if (restoredAt === null) {
		return null;
	}

	return (
		<div className={DRAFT_BANNER_CLASS} role="status">
			<HistoryIcon className="icon-stroke-regular mt-0.5 size-3.5 shrink-0" />
			<p className="flex-1">
				{`已恢复 ${formatDateTime(new Date(restoredAt))} 留在这台电脑上的草稿。继续编辑会接着存到本地，创建成功后自动清掉。`}
			</p>
			<Button onClick={onDiscard} size="xs" type="button" variant="ghost">
				放弃草稿
			</Button>
		</div>
	);
}
