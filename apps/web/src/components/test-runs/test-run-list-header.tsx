import { Button } from "@automationstack/ui/components/button";
import { PlusIcon } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { WORKSPACE_VIEW_LABELS } from "@/components/layout/workspace-path";

export function TestRunListHeader({ onCreate }: { onCreate: () => void }) {
	return (
		<PageHeader
			actions={
				<Button onClick={onCreate} type="button">
					<PlusIcon data-icon="inline-start" />
					新建测试任务
				</Button>
			}
			title={WORKSPACE_VIEW_LABELS.testRuns}
		/>
	);
}
