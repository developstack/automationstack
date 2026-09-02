/**
 * 能力清单上的「重新探测」按钮。
 *
 * 它不在行尾那三颗图标按钮里（farm-node-row-actions.tsx），而是待在展开后的清单
 * 顶上：这一下要看的结果**就在它下面那份清单里**，摆远了人按完得自己去找哪儿变了。
 * 也因此它是唯一一颗带文字的按钮——行尾那三颗靠图标区分，这里只有一颗，写清楚
 * 「重新探测」比再发明一个图标便宜。
 *
 * 三种样子（可按 / 探测中 / 离线）的判据全在 farm-node-capability-meta.ts 的
 * `refreshButtonState` 里，这里只负责画。
 */
import { Button } from "@automationstack/ui/components/button";
import { RefreshCwIcon } from "lucide-react";
import { useCallback } from "react";

import { refreshButtonState } from "@/components/farm-nodes/farm-node-capability-meta";
import type { FarmNodeRow } from "@/components/farm-nodes/farm-node-meta";
import { useRequestFarmNodeRefresh } from "@/components/farm-nodes/use-farm-node-mutations";

export function FarmNodeRefreshButton({ row }: { row: FarmNodeRow }) {
	const refresh = useRequestFarmNodeRefresh();
	const { isPending, mutate } = refresh;
	const state = refreshButtonState(row);

	const handleClick = useCallback(
		() => mutate({ id: row.id }),
		[mutate, row.id]
	);

	return (
		<div className="flex flex-wrap items-center justify-end gap-2">
			{/*
			 * 禁用的按钮不接收焦点，读屏也就走不到它——所以「为什么按不动」必须是
			 * 一段独立的正文，而不是挂在按钮上的 title/tooltip。
			 */}
			{state.hint === null ? null : (
				<span className="text-muted-foreground text-xs">{state.hint}</span>
			)}
			<Button
				/*
				 * 请求还在飞的那一瞬（服务端还没回、列表还没重取）也要禁：那段窗口里
				 * `refreshPending` 仍是旧的 false，不禁的话连点两下会发出两条下令，
				 * 而第二条对服务端是幂等的、对人却像是「按了没反应所以再按一次」。
				 */
				disabled={state.disabled || isPending}
				onClick={handleClick}
				size="sm"
				type="button"
				variant="outline"
			>
				<RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
				{state.label}
			</Button>
		</div>
	);
}
