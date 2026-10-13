import {
	Status,
	StatusIndicator,
	StatusLabel,
	type StatusProps,
} from "@automationstack/ui/components/status";

import { PresenceAvatars } from "@/realtime/presence-avatars";
import {
	type RealtimeTone,
	summarizeRealtimeStatus,
} from "@/realtime/realtime-status";
import { usePresence } from "@/realtime/use-presence";
import { useRealtimeConnectionState } from "@/realtime/use-realtime-connection-state";

// 只有已连接映射到 online，呼吸圈只在 online 显示。
const STATUS_BY_TONE = {
	connecting: "degraded",
	offline: "offline",
	online: "online",
} as const satisfies Record<RealtimeTone, StatusProps["status"]>;

/** 外框顶部右端的实时协作区域：状态圆点、短文字和折叠头像。 */
export function HeaderRealtimeStatus() {
	const connectionState = useRealtimeConnectionState();
	const presence = usePresence();
	const { detail, label, shortLabel, tone } = summarizeRealtimeStatus(
		connectionState,
		presence
	);
	const fullText = detail === null ? label : `${label}，${detail}`;
	return (
		<div className="ml-auto flex shrink-0 items-center gap-2">
			<Status
				className="shrink-0 whitespace-nowrap"
				data-tone={tone}
				role="status"
				status={STATUS_BY_TONE[tone]}
			>
				{/* 圆点和短文字只给眼睛看；title 也放这里，放在 status 上会成为可访问名称，读两遍。 */}
				<span
					aria-hidden="true"
					className="flex items-center gap-2"
					title={fullText}
				>
					<StatusIndicator />
					<StatusLabel className="tabular-nums">{shortLabel}</StatusLabel>
				</span>
				<span className="sr-only">{fullText}</span>
			</Status>
			{/* 头像放在 status 外：名称随别人切换页面而变，在实时区域里会被反复读出。 */}
			<PresenceAvatars className="max-sm:hidden" />
		</div>
	);
}
