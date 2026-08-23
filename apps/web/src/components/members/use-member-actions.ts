import type { PublicUser } from "@automationstack/db/schema/users";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { MemberConfirmKind } from "@/components/members/member-meta";
import { orpc } from "@/utils/orpc";

export interface MemberActions {
	closeConfirm: () => void;
	/** 执行当前 kind 对应的过程。 */
	confirm: () => void;
	/** 服务端错误文案；由确认框就地显示。 */
	error: string | undefined;
	isPending: boolean;
	/** null 表示没有待确认的动作。 */
	kind: MemberConfirmKind | null;
	open: (kind: MemberConfirmKind) => void;
}

type Settle = (message: string) => void;

function useRoleMutation(settle: Settle) {
	return useMutation(
		orpc.users.setRole.mutationOptions({
			// 「不能降级最后一个管理员」要出现在刚点下的确认框里，不是页角的 toast
			meta: { suppressErrorToast: true },
			onSuccess: (user) =>
				settle(
					`「${user.username}」已${user.role === "admin" ? "设为管理员" : "设为成员"}`
				),
		})
	);
}

function useDisabledMutation(settle: Settle) {
	return useMutation(
		orpc.users.setDisabled.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: (user) =>
				settle(
					`「${user.username}」已${user.disabledAt === null ? "恢复" : "停用"}`
				),
		})
	);
}

/** 单行成员的角色 / 停用两个过程，外加待确认动作的状态。 */
export function useMemberActions(member: PublicUser): MemberActions {
	const queryClient = useQueryClient();
	const [kind, setKind] = useState<MemberConfirmKind | null>(null);

	const settle = useCallback(
		(message: string) => {
			queryClient.invalidateQueries({ queryKey: orpc.users.list.key() });
			toast.success(message);
			setKind(null);
		},
		[queryClient]
	);

	const setRole = useRoleMutation(settle);
	const setDisabled = useDisabledMutation(settle);

	const confirm = useCallback(() => {
		if (kind === "demote" || kind === "promote") {
			setRole.mutate({
				id: member.id,
				role: kind === "promote" ? "admin" : "member",
			});
			return;
		}
		if (kind !== null) {
			setDisabled.mutate({ disabled: kind === "disable", id: member.id });
		}
	}, [kind, member.id, setDisabled, setRole]);

	const open = useCallback(
		(next: MemberConfirmKind) => {
			// 打开新确认框前清掉上一次的错误，否则会看到一条与当前动作无关的报错
			setRole.reset();
			setDisabled.reset();
			setKind(next);
		},
		[setDisabled, setRole]
	);

	const closeConfirm = useCallback(() => setKind(null), []);

	return {
		closeConfirm,
		confirm,
		error: (setRole.error ?? setDisabled.error)?.message,
		isPending: setRole.isPending || setDisabled.isPending,
		kind,
		open,
	};
}
