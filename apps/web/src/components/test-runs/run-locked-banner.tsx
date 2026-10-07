import { LockIcon } from "lucide-react";

import { formatDateTime } from "@/components/cases/case-meta";

const SYSTEM_SUBMITTER = "由系统自动提交";

export interface RunLockedBannerProps {
	submittedAt: Date | string;
	submittedBy: string | null;
	submittedByName: string | null;
}

export function RunLockedBanner({
	submittedAt,
	submittedBy,
	submittedByName,
}: RunLockedBannerProps) {
	const isAutoSubmitted = submittedBy === null;

	return (
		<div className="flex flex-wrap items-center gap-2 border-b bg-muted px-4 py-2 text-muted-foreground text-sm">
			<LockIcon
				aria-hidden="true"
				className="icon-stroke-regular size-4 shrink-0"
			/>
			<span>
				该报告已于 {formatDateTime(submittedAt)} 提交并锁定，内容不可再修改。
			</span>
			<span>
				{isAutoSubmitted
					? SYSTEM_SUBMITTER
					: `提交人：${submittedByName ?? "未知（账号已删除）"}`}
			</span>
			<span>需要继续测试请新建重测任务。</span>
		</div>
	);
}
