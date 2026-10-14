import { Badge } from "@automationstack/ui/components/badge";
import type { ReactNode } from "react";

import { formatDateTime } from "@/components/cases/case-meta";

import type { CaseVersionRow, VersionSelectionRole } from "./version-pair.ts";
import { VersionTag } from "./version-tag.tsx";

const ROLE_LABELS: Record<VersionSelectionRole, string> = {
	base: "基准",
	target: "对比",
	view: "查看",
};

const UNKNOWN_EDITOR = "未知";

interface VersionRowSummaryProps {
	/** 第一行右侧的操作按钮 */
	action: ReactNode;
	isCurrent: boolean;
	role: VersionSelectionRole | null;
	row: CaseVersionRow;
}

/** 一个版本的摘要：等宽字体的版本号和角色，修改人和时间，以及备注。 */
export function VersionRowSummary({
	action,
	isCurrent,
	role,
	row,
}: VersionRowSummaryProps) {
	return (
		<>
			<div className="flex min-h-6 items-center gap-2">
				<VersionTag version={row.version} />
				{isCurrent ? (
					<Badge className="font-normal" variant="outline">
						当前
					</Badge>
				) : null}
				{role === null ? null : (
					<span className="eyebrow">{ROLE_LABELS[role]}</span>
				)}
				{action}
			</div>
			<p className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
				<span className="truncate">{row.savedBy ?? UNKNOWN_EDITOR}</span>
				<span aria-hidden="true">·</span>
				<span className="numeric shrink-0">
					{formatDateTime(row.createdAt)}
				</span>
			</p>
			{row.changeNote ? (
				<p className="truncate text-xs" title={row.changeNote}>
					{row.changeNote}
				</p>
			) : null}
		</>
	);
}
