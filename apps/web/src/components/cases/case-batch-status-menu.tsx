import type { CaseStatus } from "@automationstack/db/schema/test-cases";
import { Button } from "@automationstack/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@automationstack/ui/components/dropdown-menu";
import { ChevronDownIcon } from "lucide-react";
import { useCallback } from "react";

import { STATUS_LABELS, STATUS_LIFECYCLE } from "@/components/cases/case-meta";

interface CaseBatchStatusMenuProps {
	onChange: (status: CaseStatus) => void;
}

interface StatusItemProps {
	onChange: (status: CaseStatus) => void;
	status: CaseStatus;
}

function StatusItem({ onChange, status }: StatusItemProps) {
	const select = useCallback(() => onChange(status), [onChange, status]);
	return (
		<DropdownMenuItem onClick={select}>
			{STATUS_LABELS[status]}
		</DropdownMenuItem>
	);
}

/** 批量操作栏的「改状态」：把勾选的用例都改为草稿、生效或废弃。 */
export function CaseBatchStatusMenu({ onChange }: CaseBatchStatusMenuProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button size="sm" variant="outline">
						改状态
						<ChevronDownIcon data-icon="inline-end" />
					</Button>
				}
			/>
			<DropdownMenuContent align="end" className="w-auto min-w-28">
				{STATUS_LIFECYCLE.map((status) => (
					<StatusItem key={status} onChange={onChange} status={status} />
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
