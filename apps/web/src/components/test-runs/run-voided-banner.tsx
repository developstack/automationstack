import { BanIcon } from "lucide-react";

import { formatDateTime } from "@/components/cases/case-meta";

export interface RunVoidedBannerProps {
	voidedAt: Date | string;
	voidedByName: string | null;
	voidReason: string | null;
}

export function RunVoidedBanner({
	voidedAt,
	voidedByName,
	voidReason,
}: RunVoidedBannerProps) {
	return (
		<div
			className="flex flex-wrap items-center gap-2 border-b bg-muted px-4 py-2 text-muted-foreground text-sm"
			role="status"
		>
			<BanIcon
				aria-hidden="true"
				className="icon-stroke-regular size-4 shrink-0"
			/>
			<span>
				该测试任务已于 {formatDateTime(voidedAt)} 由{" "}
				{voidedByName ?? "已删除的账号"} 作废，只能查看，不能修改。
			</span>
			{voidReason === null ? null : <span>作废原因：{voidReason}</span>}
		</div>
	);
}
