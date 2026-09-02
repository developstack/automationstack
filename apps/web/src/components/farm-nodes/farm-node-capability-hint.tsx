/**
 * 能力清单里所有说明性文字的统一样式。
 *
 * 单独一个文件而不是待在清单或外壳里：外壳（farm-node-capabilities.tsx）与清单
 * （farm-node-capability-list.tsx）都要用它，而这个仓库一个文件只导出一个组件
 * （eslint local/one-component-per-file）。它也确实只是一句话的样式，两边共用
 * 才能保证「探测于……」「还没探测过」「一台机器什么都没装」看起来是同一类话。
 */
import type { ReactNode } from "react";

export function FarmNodeCapabilityHint({ children }: { children: ReactNode }) {
	return <p className="text-muted-foreground text-xs">{children}</p>;
}
