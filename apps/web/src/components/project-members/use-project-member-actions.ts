import type { ProjectMemberView } from "@automationstack/db/repositories/project-members-repository";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { ProjectMemberConfirmKind } from "@/components/project-members/project-member-meta";
import { orpc } from "@/utils/orpc";

export interface ProjectMemberActions {
	closeConfirm: () => void;
	/** 执行当前 kind 对应的过程。 */
	confirm: () => void;
	/** 服务端错误文案；由确认框就地显示。 */
	error: string | undefined;
	isPending: boolean;
	/** null 表示没有待确认的动作。 */
	kind: ProjectMemberConfirmKind | null;
	open: (kind: ProjectMemberConfirmKind) => void;
}

type Settle = (message: string) => void;

function useRoleMutation(settle: Settle) {
	return useMutation(
		orpc.projectMembers.updateRole.mutationOptions({
			// 「不能降级项目的最后一个 owner」要出现在刚点下的确认框里，不是页角的 toast
			meta: { suppressErrorToast: true },
			onSuccess: (member) =>
				settle(member.role === "owner" ? "已设为拥有者" : "已设为成员"),
		})
	);
}

function useRemoveMutation(settle: Settle) {
	return useMutation(
		orpc.projectMembers.remove.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: () => settle("已移出项目"),
		})
	);
}

/**
 * 成功之后的收尾：失效两条查询、报一句、关掉确认框。
 *
 * `onSettled` 是调用方传进来的「关框」动作，写成参数而不是在这里直接摸状态，
 * 是为了让这个 hook 只管「成功之后该刷新什么」这一件事。
 */
function useSettle(
	projectId: string,
	username: string,
	onSettled: () => void
): Settle {
	const queryClient = useQueryClient();
	return useCallback(
		(message: string) => {
			const input = { projectId };
			queryClient.invalidateQueries({
				queryKey: orpc.projectMembers.list.key({ input }),
			});
			/*
			 * 候选人名单是「平台账号减去本项目成员」，加人和移人都会改变它：
			 * 刚被移出去的人必须重新出现在下拉框里，否则想加回来只能刷页面。
			 * 改角色不影响它，但为这一种情况分叉出两条失效路径，换来的只是省掉
			 * 一次几十字节的请求，而漏掉一处就是一份对不上的下拉框。
			 */
			queryClient.invalidateQueries({
				queryKey: orpc.projectMembers.listCandidates.key({ input }),
			});
			toast.success(`「${username}」${message}`);
			onSettled();
		},
		[onSettled, projectId, queryClient, username]
	);
}

/**
 * 单行成员的「改角色 / 移出项目」两个过程，外加待确认动作的状态。
 *
 * 与 `components/members/use-member-actions.ts` 是同一副骨架（确认框既是二次
 * 确认也是错误落点），差别只在这两条过程都要带 projectId，以及成功后要多失效
 * 一条候选人查询。
 */
export function useProjectMemberActions(
	projectId: string,
	member: ProjectMemberView
): ProjectMemberActions {
	const [kind, setKind] = useState<ProjectMemberConfirmKind | null>(null);
	const closeConfirm = useCallback(() => setKind(null), []);
	const settle = useSettle(projectId, member.username, closeConfirm);

	const setRole = useRoleMutation(settle);
	const remove = useRemoveMutation(settle);

	const confirm = useCallback(() => {
		if (kind === "remove") {
			remove.mutate({ projectId, userId: member.userId });
			return;
		}
		if (kind !== null) {
			setRole.mutate({
				projectId,
				role: kind === "promote" ? "owner" : "member",
				userId: member.userId,
			});
		}
	}, [kind, member.userId, projectId, remove, setRole]);

	const open = useCallback(
		(next: ProjectMemberConfirmKind) => {
			// 打开新确认框前清掉上一次的错误，否则会看到一条与当前动作无关的报错
			setRole.reset();
			remove.reset();
			setKind(next);
		},
		[remove, setRole]
	);

	return {
		closeConfirm,
		confirm,
		error: (setRole.error ?? remove.error)?.message,
		isPending: setRole.isPending || remove.isPending,
		kind,
		open,
	};
}
