import type { PresenceEntry } from "@automationstack/api/realtime/protocol";
import { AvatarGroup } from "@automationstack/ui/components/avatar-group";
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
import { uniquePresenceUsers } from "./presence-users";
import { useRealtime } from "./realtime-context";
import { usePresence } from "./use-presence";

const MAX_VISIBLE_AVATARS = 5;

const VIEW_LABELS: Record<string, string> = {
	list: "列表",
	mindmap: "脑图",
	overview: "概览",
	settings: "设置",
	testRuns: "测试任务",
	users: "成员",
};

function PresenceAvatarTrigger({
	entry,
	isSelf,
}: {
	entry: PresenceEntry;
	isSelf: boolean;
}) {
	const viewLabel = VIEW_LABELS[entry.view] ?? entry.view;
	const label = `${entry.name}${isSelf ? "（我）" : ""} · ${viewLabel}`;
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

export function PresenceAvatars({ className }: { className?: string }) {
	const selfClientId = useRealtime()?.clientId ?? null;
	// 按用户去重，头像和「+N」与顶栏的「N 人在线」一致。
	const entries = uniquePresenceUsers(usePresence(), selfClientId);
	const visible = entries.slice(0, MAX_VISIBLE_AVATARS);
	const overflow = entries.length - visible.length;
	return (
		<AvatarGroup className={cn("-space-x-1.5", className)}>
			{visible.map((entry) => (
				<PresenceAvatarTrigger
					entry={entry}
					isSelf={entry.clientId === selfClientId}
					key={entry.clientId}
				/>
			))}
			{overflow > 0 ? <OverflowAvatar count={overflow} /> : null}
		</AvatarGroup>
	);
}
