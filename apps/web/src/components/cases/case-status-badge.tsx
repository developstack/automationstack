/**
 * 用例状态徽章。列表、详情、版本快照三处必须渲染同一枚徽章：
 * 之前状态点只存在于表格的局部组件里，详情与快照拿到的是没有状态点的裸
 * outline 徽章，同一条用例在三个视图里长得不一样。
 *
 * 刻意留在 apps/web 而不下沉到 packages/ui：CaseStatus 是业务枚举，
 * 通用 Badge 组件不应该认识它。
 */
import type { CaseStatus } from "@automationstack/db/schema/test-cases";
import { Badge } from "@automationstack/ui/components/badge";
import { cn } from "@automationstack/ui/lib/utils";

import {
	STATUS_BADGE_VARIANTS,
	STATUS_DOT_CLASSES,
	STATUS_LABELS,
} from "@/components/cases/case-meta";

/** 统一 outline + 状态点，和优先级的填充色阶区分开。 */
export function CaseStatusBadge({ status }: { status: CaseStatus }) {
	return (
		<Badge variant={STATUS_BADGE_VARIANTS[status]}>
			<span
				aria-hidden={true}
				className={cn(
					"size-1.5 shrink-0 rounded-full",
					STATUS_DOT_CLASSES[status]
				)}
			/>
			{STATUS_LABELS[status]}
		</Badge>
	);
}
