import { Skeleton } from "@automationstack/ui/components/skeleton";
import {
	HEADING_ID,
	SECTION_DESCRIPTION,
	SECTION_TITLE,
} from "@/components/api-tokens/api-tokens-section-meta";
import { ApiTokensTableSkeleton } from "@/components/api-tokens/api-tokens-table-skeleton";
import { SettingsSection } from "@/components/settings/settings-section";

export function ApiTokensPagePending() {
	return (
		<SettingsSection
			description={SECTION_DESCRIPTION}
			headingId={HEADING_ID}
			title={SECTION_TITLE}
		>
			<div className="flex justify-end">
				<Skeleton className="h-8 w-28" />
			</div>
			<ApiTokensTableSkeleton />
		</SettingsSection>
	);
}
