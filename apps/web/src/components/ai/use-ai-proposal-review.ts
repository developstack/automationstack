/**
 * 评审阶段的勾选状态与采纳/拒绝动作。
 * 只有 status 为 proposed 的提案可勾选；成功后就地改状态并清空选择。
 */
import { useCallback, useMemo, useState } from "react";

import type { AiProposalEntry } from "@/components/ai/ai-generation-state";
import { useAiProposalActions } from "@/components/ai/use-ai-proposal-actions";

function useIdSelection(pendingIds: string[]) {
	const [selected, setSelected] = useState<string[]>([]);

	const toggle = useCallback((id: string) => {
		setSelected((prev) =>
			prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
		);
	}, []);

	const toggleAll = useCallback(() => {
		setSelected((prev) =>
			prev.length === pendingIds.length ? [] : pendingIds
		);
	}, [pendingIds]);

	const clear = useCallback(() => setSelected([]), []);

	return { clear, selected, toggle, toggleAll };
}

export interface AiProposalReviewOptions {
	moduleId: string | undefined;
	onStatusChange: (
		proposalIds: string[],
		status: "accepted" | "rejected"
	) => void;
	proposals: AiProposalEntry[];
}

export function useAiProposalReview(options: AiProposalReviewOptions) {
	const pendingIds = useMemo(
		() =>
			options.proposals
				.filter((entry) => entry.status === "proposed")
				.map((entry) => entry.id),
		[options.proposals]
	);
	const selection = useIdSelection(pendingIds);
	const { clear, selected } = selection;
	const { moduleId, onStatusChange } = options;

	const actions = useAiProposalActions({
		onAccepted: (ids) => {
			onStatusChange(ids, "accepted");
			clear();
		},
		onRejected: (ids) => {
			onStatusChange(ids, "rejected");
			clear();
		},
	});

	const accept = useCallback(() => {
		if (moduleId !== undefined && selected.length > 0) {
			actions.accept.mutate({ moduleId, proposalIds: selected });
		}
	}, [actions.accept, moduleId, selected]);

	const reject = useCallback(() => {
		if (selected.length > 0) {
			actions.reject.mutate({ proposalIds: selected });
		}
	}, [actions.reject, selected]);

	return {
		accept,
		acceptPending: actions.accept.isPending,
		pendingIds,
		reject,
		rejectPending: actions.reject.isPending,
		selection,
	};
}
