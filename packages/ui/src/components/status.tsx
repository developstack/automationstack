// 来源：Kibo UI 的 status（https://www.kibo-ui.com/r/status.json），手工 vendored。
// 没用 shadcn add：它会覆盖本仓改过的 badge.tsx（destructive-solid 变体），还会装一个无关的 npm 包 cn。
// 与上游的差异如下，其余与上游一致（缩进与 import 顺序按 Biome 格式化）：
// 1. 平铺路径，不放 kibo-ui/status/index.tsx：包导出 ./components/* 只认一层；import 改为包内别名
// 2. 颜色改用主题 token（success / destructive / info / warning），亮暗模式跟随主题
// 3. 扩散的 ping 圈只在 online 显示（issue #51：只有已连接在呼吸，其余状态静止），所以圈只留 online 的底色
// 4. ping 周期从 1s 放慢到 2s，接近呼吸节奏；曲线与 Tailwind 的 animate-ping 相同
// 5. 减弱动效时不显示 ping 圈：globals.css 只把动画缩短，动画结束后圈仍停在原处
// 6. 指示点 aria-hidden：含义由 StatusLabel 的文字承担
import { Badge } from "@automationstack/ui/components/badge";
import { cn } from "@automationstack/ui/lib/utils";
import type { ComponentProps, HTMLAttributes } from "react";

export type StatusProps = ComponentProps<typeof Badge> & {
	status: "online" | "offline" | "maintenance" | "degraded";
};

export const Status = ({ className, status, ...props }: StatusProps) => (
	<Badge
		className={cn("flex items-center gap-2", "group", status, className)}
		variant="secondary"
		{...props}
	/>
);

export type StatusIndicatorProps = HTMLAttributes<HTMLSpanElement>;

export const StatusIndicator = ({
	className,
	...props
}: StatusIndicatorProps) => (
	<span aria-hidden="true" className="relative flex h-2 w-2" {...props}>
		<span
			className={cn(
				"absolute hidden h-full w-full animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite] rounded-full bg-success opacity-75",
				"motion-safe:group-[.online]:inline-flex"
			)}
		/>
		<span
			className={cn(
				"relative inline-flex h-2 w-2 rounded-full",
				"group-[.online]:bg-success",
				"group-[.offline]:bg-destructive",
				"group-[.maintenance]:bg-info",
				"group-[.degraded]:bg-warning"
			)}
		/>
	</span>
);

export type StatusLabelProps = HTMLAttributes<HTMLSpanElement>;

export const StatusLabel = ({
	className,
	children,
	...props
}: StatusLabelProps) => (
	<span className={cn("text-muted-foreground", className)} {...props}>
		{children ?? (
			<>
				<span className="hidden group-[.online]:block">Online</span>
				<span className="hidden group-[.offline]:block">Offline</span>
				<span className="hidden group-[.maintenance]:block">Maintenance</span>
				<span className="hidden group-[.degraded]:block">Degraded</span>
			</>
		)}
	</span>
);
