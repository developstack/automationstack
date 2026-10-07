import { Button } from "@automationstack/ui/components/button";
import { CollapsibleTrigger } from "@automationstack/ui/components/collapsible";
import { ChevronDownIcon } from "lucide-react";

import { RUN_SECTION_TITLE } from "@/components/test-runs/run-panel-typography";

export function RunSectionTrigger({ label }: { label: string }) {
	return (
		<CollapsibleTrigger
			render={
				<Button
					className="w-full justify-start px-0"
					type="button"
					variant="ghost"
				>
					<span className={RUN_SECTION_TITLE}>{label}</span>
					<ChevronDownIcon
						aria-hidden="true"
						className="transition-transform group-data-open/run-section:rotate-180"
					/>
				</Button>
			}
		/>
	);
}
