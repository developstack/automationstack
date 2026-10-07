import { Button } from "@automationstack/ui/components/button";
import { PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";

import {
	HEADING_ID,
	SECTION_DESCRIPTION,
	SECTION_TITLE,
} from "@/components/api-tokens/api-tokens-section-meta";
import { ApiTokensTable } from "@/components/api-tokens/api-tokens-table";
import { CreateApiTokenDialog } from "@/components/api-tokens/create-api-token-dialog";
import { SettingsSection } from "@/components/settings/settings-section";

export function ApiTokensPage() {
	const [creating, setCreating] = useState(false);
	const openCreate = useCallback(() => setCreating(true), []);
	const closeCreate = useCallback(() => setCreating(false), []);

	return (
		<SettingsSection
			description={SECTION_DESCRIPTION}
			headingId={HEADING_ID}
			title={SECTION_TITLE}
		>
			<div className="flex justify-end">
				<Button onClick={openCreate}>
					<PlusIcon aria-hidden="true" data-icon="inline-start" />
					新建 Token
				</Button>
			</div>
			<ApiTokensTable />
			<CreateApiTokenDialog onClose={closeCreate} open={creating} />
		</SettingsSection>
	);
}
