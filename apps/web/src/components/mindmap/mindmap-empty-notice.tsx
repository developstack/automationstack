import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@automationstack/ui/components/alert";
import { Kbd } from "@automationstack/ui/components/kbd";
import { NetworkIcon } from "lucide-react";

/** 项目还没有模块时的下一步指引。画布上仍然显示项目节点，可以直接新建。 */
export function MindmapEmptyNotice() {
	return (
		<Alert data-testid="mindmap-empty-notice" role="note" variant="muted">
			<NetworkIcon aria-hidden="true" />
			<AlertTitle>该项目还没有模块</AlertTitle>
			<AlertDescription>
				选中画布中间的项目节点，按{" "}
				<Kbd className="border bg-card text-foreground">Tab</Kbd>{" "}
				新建第一个模块。
			</AlertDescription>
		</Alert>
	);
}
