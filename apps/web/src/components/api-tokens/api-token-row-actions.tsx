import type { ApiTokenView } from "@automationstack/db/schema/api-tokens";
import { Button } from "@automationstack/ui/components/button";

import { RevokeApiTokenDialog } from "@/components/api-tokens/revoke-api-token-dialog";
import { useApiTokenActions } from "@/components/api-tokens/use-api-token-actions";

export function ApiTokenRowActions({ token }: { token: ApiTokenView }) {
	const actions = useApiTokenActions(token);

	return (
		<>
			<Button
				aria-label={`吊销 token「${token.name}」`}
				onClick={actions.openConfirm}
				size="sm"
				variant="ghost"
			>
				吊销
			</Button>
			<RevokeApiTokenDialog actions={actions} token={token} />
		</>
	);
}
