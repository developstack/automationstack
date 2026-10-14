import { cn } from "@automationstack/ui/lib/utils";
import type { ReactNode } from "react";

export type DiffMarkKind = "added" | "removed";

/**
 * 新增的内容带下划线，删除的内容带删除线，所以不只用颜色区分。
 * 颜色使用状态令牌，浅色和暗色模式各自取值。
 */
const DIFF_MARK_CLASSES: Record<DiffMarkKind, string> = {
	added:
		"rounded-xs bg-success-soft text-success-soft-foreground underline decoration-1 underline-offset-2",
	removed:
		"rounded-xs bg-destructive-soft text-destructive-soft-foreground line-through decoration-1",
};

// 读屏软件通常不读出 ins 和 del 的含义，所以加一段只给读屏软件的文字
const SCREEN_READER_PREFIX: Record<DiffMarkKind, string> = {
	added: "新增：",
	removed: "删除：",
};

interface DiffMarkProps {
	children: ReactNode;
	className?: string;
	kind: DiffMarkKind;
}

/** 版本对比中一段新增或删除的内容。 */
export function DiffMark({ children, className, kind }: DiffMarkProps) {
	const Element = kind === "added" ? "ins" : "del";
	return (
		<Element className={cn(DIFF_MARK_CLASSES[kind], className)}>
			<span className="sr-only">{SCREEN_READER_PREFIX[kind]}</span>
			{children}
		</Element>
	);
}
