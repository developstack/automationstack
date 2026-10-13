import {
	Alert,
	AlertActions,
	AlertDescription,
	AlertTitle,
} from "@automationstack/ui/components/alert";
import { Button } from "@automationstack/ui/components/button";
import { HistoryIcon, TriangleAlertIcon } from "lucide-react";

import { formatDateTime } from "@/components/cases/case-meta";

/** 新建面板中草稿提示的位置：头部下方，与表单左右对齐。 */
export const DRAFT_NOTICE_CLASS = "mx-4 mb-3 w-auto";

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
			<Alert className={DRAFT_NOTICE_CLASS} variant="warning">
				<TriangleAlertIcon aria-hidden="true" />
				<AlertTitle>草稿不在这台电脑上</AlertTitle>
				<AlertDescription>
					要继续编辑的草稿已经删除，或者这个链接在其他浏览器中打开。下面是一张空白的新建表单。
				</AlertDescription>
			</Alert>
		);
	}

	if (restoredAt === null) {
		return null;
	}

	return (
		<Alert className={DRAFT_NOTICE_CLASS} role="status" variant="muted">
			<HistoryIcon aria-hidden="true" />
			<AlertTitle>
				已恢复{" "}
				<span className="numeric">{formatDateTime(new Date(restoredAt))}</span>{" "}
				的草稿
			</AlertTitle>
			<AlertDescription>
				草稿只存在这台电脑上。继续编辑会接着保存到本地，创建成功后自动删除。
			</AlertDescription>
			<AlertActions>
				<Button onClick={onDiscard} size="xs" type="button" variant="outline">
					放弃草稿
				</Button>
			</AlertActions>
		</Alert>
	);
}
