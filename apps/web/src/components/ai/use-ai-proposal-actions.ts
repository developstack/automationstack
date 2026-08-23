/**
 * 提案的采纳 / 拒绝。
 *
 * 采纳成功后端不会推 realtime 事件，所以这里必须自行 invalidate 用例查询，
 * 否则新入库的 draft 用例不会出现在列表里。
 */
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { useInvalidateCases } from "@/components/cases/use-case-mutations";
import { orpc } from "@/utils/orpc";

export interface AiProposalActionsOptions {
	onAccepted: (proposalIds: string[]) => void;
	onRejected: (proposalIds: string[]) => void;
}

export function useAiProposalActions(options: AiProposalActionsOptions) {
	const invalidateCases = useInvalidateCases();

	const accept = useMutation(
		orpc.ai.acceptProposals.mutationOptions({
			onSuccess: (result, variables) => {
				invalidateCases();
				toast.success(`已采纳 ${result.caseIds.length} 条用例`);
				options.onAccepted(variables.proposalIds);
			},
		})
	);

	const reject = useMutation(
		orpc.ai.rejectProposals.mutationOptions({
			onSuccess: (result, variables) => {
				toast.success(`已拒绝 ${result.rejectedIds.length} 条提案`);
				options.onRejected(variables.proposalIds);
			},
		})
	);

	return { accept, reject };
}
