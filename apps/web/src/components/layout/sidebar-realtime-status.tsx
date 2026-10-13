import { cn } from "@automationstack/ui/lib/utils";

import {
	type RealtimeTone,
	summarizeRealtimeStatus,
} from "@/realtime/realtime-status";
import { usePresence } from "@/realtime/use-presence";
import { useRealtimeConnectionState } from "@/realtime/use-realtime-connection-state";

const DOT_CLASS: Record<RealtimeTone, string> = {
	connecting: "animate-pulse bg-warning motion-reduce:animate-none",
	offline: "bg-destructive",
	online: "bg-success",
};

/** 侧栏底部的实时协作状态。实时协作按项目连接，所以只有项目侧栏显示。 */
export function SidebarRealtimeStatus() {
	const connectionState = useRealtimeConnectionState();
	const presence = usePresence();
	const { detail, label, tone } = summarizeRealtimeStatus(
		connectionState,
		presence
	);
	const text = detail === null ? label : `${label}，${detail}`;
	return (
		<div
			className="flex items-start gap-2 rounded-lg border bg-card px-2.5 py-2 text-card-foreground shadow-card group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:shadow-none"
			data-tone={tone}
			role="status"
			title={text}
		>
			<span
				aria-hidden="true"
				className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT_CLASS[tone])}
			/>
			<span className="flex min-w-0 flex-col group-data-[collapsible=icon]:sr-only">
				<span className="font-medium text-caption">{label}</span>
				{detail === null ? null : (
					<span className="text-caption text-muted-foreground">{detail}</span>
				)}
			</span>
		</div>
	);
}
