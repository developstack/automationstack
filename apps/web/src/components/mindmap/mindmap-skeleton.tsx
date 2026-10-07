import { Loader2Icon } from "lucide-react";

export function MindmapSkeleton() {
	return (
		<div className="flex h-full flex-col">
			<div className="min-h-0 flex-1">
				<output
					aria-busy="true"
					className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground"
				>
					<Loader2Icon aria-hidden="true" className="animate-spin" />
					<span className="text-sm">正在加载脑图…</span>
				</output>
			</div>
		</div>
	);
}
