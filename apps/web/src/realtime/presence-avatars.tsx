import type { PresenceEntry } from "@automationstack/api/realtime/protocol";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@automationstack/ui/components/tooltip";
import { cn } from "@automationstack/ui/lib/utils";
import { useCallback } from "react";

import {
	PRESENCE_AVATAR_CLASS,
	PRESENCE_OVERFLOW_CLASS,
	PresenceAvatar,
	type PresenceAvatarRenderProps,
} from "./presence-avatar";
import { useRealtime } from "./realtime-context";
import { usePresence } from "./use-presence";

const MAX_VISIBLE_AVATARS = 5;

/**
 * 视图标识 → 中文名（未知视图原样显示）。
 *
 * 键要跟 `routes/projects/$projectId/route.tsx` 的 `viewFor()` 一一对上。
 * 协议里 `view` 是 `z.string().min(1)`，不是枚举，后端不会替这里挡漏项——
 * 漏一个的下场是头像 tooltip 上直接念出 `testRuns` 这种内部标识。
 */
const VIEW_LABELS: Record<string, string> = {
	list: "列表",
	mindmap: "脑图",
	overview: "概览",
	settings: "设置",
	testRuns: "测试任务",
};

/**
 * 不覆盖 TooltipTrigger 的 render：Base UI 默认渲染 button，是可聚焦的；
 * 之前用 render={<span>} 把它降级成了纯装饰元素，键盘够不到 tooltip，读屏也
 * 什么都念不到（头像图片是 alt="" 的装饰）。可访问名靠这里的 aria-label 给全
 * （用户名 + 所在视图）。
 *
 * 头像本身交给 PresenceAvatar 画（与用例列表协作列同一份实现），这里只负责
 * 把它接到 trigger 上：头像的样式必须只有一个出处，否则两处迟早各改各的。
 */
function PresenceAvatarTrigger({
	entry,
	isSelf,
}: {
	entry: PresenceEntry;
	isSelf: boolean;
}) {
	const viewLabel = VIEW_LABELS[entry.view] ?? entry.view;
	const label = `${entry.name}${isSelf ? "（我）" : ""} · ${viewLabel}`;
	// useCallback 不是为了性能，是 noJsxPropsBind：render 传内联箭头会被判成
	// 每次渲染都换一个新引用。依赖只有真正进入闭包的那两个值。
	const renderTrigger = useCallback(
		(avatar: PresenceAvatarRenderProps) => (
			<TooltipTrigger
				aria-label={label}
				data-presence-avatar={entry.clientId}
				{...avatar}
			/>
		),
		[entry.clientId, label]
	);
	return (
		<Tooltip>
			<PresenceAvatar name={entry.name} render={renderTrigger} />
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

/** 超出上限的折叠指示器：同样是可聚焦按钮，键盘能触达且有可访问名。 */
function OverflowAvatar({ count }: { count: number }) {
	const label = `还有 ${count} 人在线`;
	return (
		<Tooltip>
			<TooltipTrigger
				aria-label={label}
				className={cn(PRESENCE_AVATAR_CLASS, PRESENCE_OVERFLOW_CLASS)}
			>
				{`+${count}`}
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

/**
 * 在线成员头像组：按用户名确定性生成的 blobatar 头像，超出上限折叠为 +N。
 * 名字取 presence 里服务端下发的值，前端没有可编辑的身份入口，所以同一个人
 * 在谁的屏幕上都是同一张脸。
 */
export function PresenceAvatars({ className }: { className?: string }) {
	const entries = usePresence();
	const selfClientId = useRealtime()?.clientId ?? null;
	const visible = entries.slice(0, MAX_VISIBLE_AVATARS);
	const overflow = entries.length - visible.length;
	// TooltipProvider 不在这里包：根节点（routes/__root.tsx）已经挂了全局那一份。
	return (
		<div className={cn("flex items-center -space-x-1.5", className)}>
			{visible.map((entry) => (
				<PresenceAvatarTrigger
					entry={entry}
					isSelf={entry.clientId === selfClientId}
					key={entry.clientId}
				/>
			))}
			{overflow > 0 ? <OverflowAvatar count={overflow} /> : null}
		</div>
	);
}
