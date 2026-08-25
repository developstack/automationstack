/**
 * 登记表首屏骨架，尺寸逐项按真实表格折算（对齐 case-table-states.tsx 的惯例）：
 * 表头 = TableHead 的 h-10 + TableHeader 的 border-b 1px；数据行 = TableCell 的
 * p-2 + 行内内容 20px = h-9，行线 1px。行数取满一页（PROVIDER_PAGE_SIZE），
 * 不满页时骨架比真身高，多出来的空白往下收，最大位移被一页封顶。
 *
 * 圆角覆盖成 rounded-none：Skeleton 默认 rounded-md，表格行是方角的，
 * 替身要跟真身同形。
 */
import { Skeleton } from "@automationstack/ui/components/skeleton";

import { PROVIDER_PAGE_SIZE } from "@/components/provider/provider-config-query";

function skeletonRowKeys(rows: number): string[] {
	return Array.from({ length: rows }, (_, index) => `skeleton-row-${index}`);
}

export function ProviderConfigTableSkeleton({
	rows = PROVIDER_PAGE_SIZE,
}: {
	rows?: number;
}) {
	return (
		<output
			aria-busy="true"
			aria-label="Provider 登记列表加载中"
			className="flex flex-col"
		>
			<Skeleton className="mb-px h-10 w-full rounded-none" />
			{skeletonRowKeys(rows).map((key) => (
				<Skeleton className="mt-px h-9 w-full rounded-none" key={key} />
			))}
		</output>
	);
}
