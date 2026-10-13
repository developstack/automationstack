import type { ReactNode } from "react";

interface VersionSectionProps {
	/** 标题右侧的内容，例如变化的数量 */
	aside?: ReactNode;
	children: ReactNode;
	title: string;
}

/** 快照查看和版本对比中的一节。标题是小标签，与用例详情一致。 */
export function VersionSection({
	aside,
	children,
	title,
}: VersionSectionProps) {
	return (
		<section className="flex flex-col gap-2">
			<div className="flex min-h-5 flex-wrap items-center justify-between gap-2">
				<h4 className="eyebrow">{title}</h4>
				{aside}
			</div>
			{children}
		</section>
	);
}
