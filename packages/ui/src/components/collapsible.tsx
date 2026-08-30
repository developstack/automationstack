"use client";

/* 内部实现换成 collapsible-primitives.tsx 里 vendored 的 Animate UI primitive：
   开合由 motion 逐帧驱动，高度动画可打断，展开到一半再收起会从当前高度接着走。
   原来这层不带任何动画，动画全靠调用处加 globals.css 的 collapsible-panel 类
   （CSS transition 版），两套并存会串成双重过渡——primitive 内部已按内联样式
   关掉那层过渡，理由写在 collapsible-primitives.tsx 的头注释里。
   对外 props 与导出保持原样。 */

import {
	Collapsible as CollapsibleBase,
	CollapsiblePanel,
	CollapsibleTrigger as CollapsibleTriggerBase,
} from "@automationstack/ui/components/collapsible-primitives";
import type { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
	return <CollapsibleBase data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
	return <CollapsibleTriggerBase data-slot="collapsible-trigger" {...props} />;
}

function CollapsibleContent({ ...props }: CollapsiblePrimitive.Panel.Props) {
	return <CollapsiblePanel data-slot="collapsible-content" {...props} />;
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
