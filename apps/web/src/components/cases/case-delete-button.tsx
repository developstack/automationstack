import { Trash2Icon } from "lucide-react";
import { useCallback } from "react";

import { useRemoveCase } from "@/components/cases/use-case-mutations";
import { InlineConfirm } from "@/components/interaction/inline-confirm";

interface CaseDeleteButtonProps {
	caseId: string;
	onDeleted: () => void;
}

export function CaseDeleteButton({ caseId, onDeleted }: CaseDeleteButtonProps) {
	const remove = useRemoveCase(onDeleted);
	const handleConfirm = useCallback(
		() => remove.mutate({ id: caseId }),
		[caseId, remove]
	);

	return (
		<InlineConfirm
			confirmLabel="确认删除"
			onConfirm={handleConfirm}
			pending={remove.isPending}
			prompt="删除后用例和版本历史不可恢复。"
			triggerAriaLabel="删除用例"
			triggerIcon={<Trash2Icon data-icon="inline-start" />}
			triggerLabel="删除"
		/>
	);
}
