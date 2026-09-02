/**
 * 展开一行节点后看到的那块：**这台机器上有哪些浏览器**。
 *
 * ── 为什么它是展开的，不是一列 ──
 * 一台机器上的浏览器是零到十几条不等的清单，每条还带版本、通道、路径/镜像，
 * 塞进表格的一格里只能塞成一句「chromium 140 等 3 项」——而那句话回答不了运维
 * 唯一想问的问题（我要的那个版本在不在、装了为什么用不了）。摊开在行下面则
 * 谁展开谁看，不展开的人一列都不多付。
 *
 * ── 灰显的那几条不是坏数据 ──
 * `available: false` 是**探到了但用不了**（Safari 那类），协议刻意保留了它们与
 * 一句人话的 `reason`。不上报的话，界面上「什么都看不到」与「装了但本期不支持」
 * 会是同一幅样子，而这两种情况下运维的下一步动作完全相反。
 *
 * ── 这份清单可能是旧的 ──
 * 它是落库的展示副本，不是调度判据（分工见 farm-node-capability-meta.ts 顶部）。
 * 所以「探测于……」那一行与清单同进同出，绝不允许只画清单不画时刻。
 *
 * 一条能力具体怎么念在 farm-node-capability-list.tsx，这里只管外壳与三选一。
 */
import { FarmNodeCapabilityHint } from "@/components/farm-nodes/farm-node-capability-hint";
import { FarmNodeCapabilityList } from "@/components/farm-nodes/farm-node-capability-list";
import { capabilityDetectedLabel } from "@/components/farm-nodes/farm-node-capability-meta";
import type { FarmNodeRow } from "@/components/farm-nodes/farm-node-meta";
import { FarmNodeRefreshButton } from "@/components/farm-nodes/farm-node-refresh-button";

/*
 * 整段抄成常量而不是直接写在 JSX 里：格式化器按行宽折 JSX 文本，折点落在中文
 * 句读之间时会渲染出一个多余的空格（同 farm-nodes-table.tsx 里那条）。
 */
const NEVER_DETECTED_HINT =
	"这台机器还没有报过它有哪些浏览器。agent 连上来时会自动报一份；也可以按「重新探测」催一下。";

/**
 * @param now 由调用方给（表格传的是 React Query 的 `dataUpdatedAt`）——这一页是
 *   SSR 的，渲染里读 `Date.now()` 会 hydration mismatch，推导见 farm-node-meta.ts。
 */
export function FarmNodeCapabilities({
	now,
	row,
}: {
	now: number;
	row: FarmNodeRow;
}) {
	const { capabilities } = row;

	return (
		// 展开区是从一行表格里长出来的，读屏得知道这份清单属于哪台机器
		<section
			aria-label={`「${row.name}」的能力清单`}
			className="flex flex-col gap-3 px-4 py-3"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<FarmNodeCapabilityHint>
					{capabilityDetectedLabel(row.capabilitiesUpdatedAt, now)}
				</FarmNodeCapabilityHint>
				<FarmNodeRefreshButton row={row} />
			</div>
			{capabilities === null ? (
				<FarmNodeCapabilityHint>{NEVER_DETECTED_HINT}</FarmNodeCapabilityHint>
			) : (
				<FarmNodeCapabilityList capabilities={capabilities} />
			)}
		</section>
	);
}
