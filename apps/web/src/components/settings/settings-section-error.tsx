import { Button } from "@automationstack/ui/components/button";

/**
 * 取数失败时的分区内提示。
 *
 * 全局 QueryCache 已经弹了一条带重试的 toast，但 toast 会自己消失，而这块
 * 区域会一直空着；不在原地说一句，用户看到的就是「这个分区没了」。
 *
 * 自 settings-section.tsx 拆出。
 */
export function SettingsSectionError({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex flex-wrap items-center gap-3" role="status">
			<p className="text-destructive text-xs">这一节的配置没能加载出来。</p>
			<Button onClick={onRetry} size="sm" type="button" variant="outline">
				重试
			</Button>
		</div>
	);
}
