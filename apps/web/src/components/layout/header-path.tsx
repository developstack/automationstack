import type { ReactNode } from "react";

export interface HeaderPathItem {
	/** 当前页面的那一项。路径的其他项是上级位置。 */
	current?: boolean;
	key: string;
	label: ReactNode;
}

export const HEADER_PATH_LINK_CLASS =
	"rounded-sm underline-offset-4 hover:text-foreground hover:underline";

/** 外框顶部的小号路径。 */
export function HeaderPath({ items }: { items: readonly HeaderPathItem[] }) {
	return (
		<nav aria-label="面包屑" className="min-w-0">
			<ol className="flex min-w-0 items-center gap-1.5">
				{items.map((item, index) => (
					<li className="flex min-w-0 items-center gap-1.5" key={item.key}>
						{index === 0 ? null : <span aria-hidden="true">/</span>}
						<div
							aria-current={item.current === true ? "page" : undefined}
							className={
								item.current === true ? "truncate text-foreground" : "truncate"
							}
						>
							{item.label}
						</div>
					</li>
				))}
			</ol>
		</nav>
	);
}
