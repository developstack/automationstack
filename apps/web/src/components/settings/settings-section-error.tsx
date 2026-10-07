import { Button } from "@automationstack/ui/components/button";

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
