import type { PublicUser } from "@automationstack/db/schema/users";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { PlatformUserConfirmKind } from "@/components/platform-users/platform-user-meta";
import { orpc } from "@/utils/orpc";

export interface PlatformUserActions {
	closeConfirm: () => void;
	/** 执行当前 kind 对应的过程。 */
	confirm: () => void;
	/** 服务端错误文案；由确认框就地显示。 */
	error: string | undefined;
	isPending: boolean;
	/** null 表示没有待确认的动作。 */
	kind: PlatformUserConfirmKind | null;
	open: (kind: PlatformUserConfirmKind) => void;
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

/**
 * 单个平台用户的角色 / 停用两个过程，外加待确认动作的状态。
 *
 * 入参仍然只收 `PublicUser`：这两条过程改的都是账号本身的列，与「他在哪些项目
 * 里」无关，调用方喂 `row.user` 即可，不必把整行 `UserWithProjects` 传进来。
 */
export function usePlatformUserActions(user: PublicUser): PlatformUserActions {
	const queryClient = useQueryClient();
	const [kind, setKind] = useState<PlatformUserConfirmKind | null>(null);

	const settle = useCallback(
		(message: string) => {
			/*
			 * 表格读的是 listWithProjects，失效的必须是这一条——users.list 是另一个
			 * 查询键，刷了它这张表一动不动。改角色 / 停用都不会改动项目归属，但
			 * 「用户 + 所属项目」在服务端是同一条查询，只能整条失效。
			 */
			queryClient.invalidateQueries({
				queryKey: orpc.users.listWithProjects.key(),
			});
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
				id: user.id,
				role: kind === "promote" ? "admin" : "member",
			});
			return;
		}
		if (kind !== null) {
			setDisabled.mutate({ disabled: kind === "disable", id: user.id });
		}
	}, [kind, setDisabled, setRole, user.id]);

	const open = useCallback(
		(next: PlatformUserConfirmKind) => {
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
