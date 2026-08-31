import type { ProjectRole } from "@automationstack/db/schema/project-members";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { orpc } from "@/utils/orpc";

/**
 * 「管理项目归属」对话框背后的三条过程：加进项目、移出项目、改项目角色。
 *
 * 复用的是项目成员那三条现成的端点（`projectMembers.add / remove / updateRole`），
 * **没有**为这一页新开任何批量端点。逐个项目单独调是有意的：`remove` 里挂着
 * `countProjectOwners` 的「不能移除项目的最后一个 owner」护栏，一次调用只管一个
 * 项目，护栏才逐个生效；攒成一次批量提交的话，要么护栏在服务端被绕过去，要么
 * 一个项目失败会把其余几个的成败一起变成薛定谔的。
 *
 * 这三条是 `protectedProcedure` + `requireProjectMember` + `canAdministerProject`，
 * 而 `canAdministerProject` 对平台 admin 直接返回 true（见
 * packages/api/src/lib/project-access.ts），所以平台 admin 即便不在某个项目的成员
 * 表里也调得动——这一页正是靠这一点管别人的项目归属的。
 */

/** 三条过程共用的失效清单。 */
function useInvalidateMembership() {
	const queryClient = useQueryClient();
	return useCallback(
		(projectId: string) => {
			/*
			 * 这一条不能漏：本页表格的「所属项目」列就是从 listWithProjects 读的，
			 * 不失效它，刚加完的项目不会出现在行里，刚移出的也不会消失。
			 */
			queryClient.invalidateQueries({
				queryKey: orpc.users.listWithProjects.key(),
			});
			/*
			 * 另外两条是项目内成员页的缓存：同一次会话里从这里改完再走进那个项目，
			 * 看到的必须是同一份名单。候选人下拉（listCandidates）是「平台账号减去
			 * 本项目成员」，加人和移人都会改变它。写法照 project-members/
			 * use-project-member-actions.ts 的同一套。
			 */
			const input = { projectId };
			queryClient.invalidateQueries({
				queryKey: orpc.projectMembers.list.key({ input }),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.projectMembers.listCandidates.key({ input }),
			});
		},
		[queryClient]
	);
}

export interface UserProjectActions {
	/** 把这个人加进某个项目。 */
	add: (projectId: string, role: ProjectRole) => void;
	/**
	 * 服务端拒绝时的原话（「不能移除项目的最后一个 owner」等），由对话框就地展示。
	 * 三条过程共用一处：同一时刻只可能有一条在跑。
	 */
	error: string | undefined;
	isPending: boolean;
	/** 把这个人移出某个项目。 */
	remove: (projectId: string) => void;
	/** 改这个人在某个项目里的角色。 */
	setRole: (projectId: string, role: ProjectRole) => void;
}

/**
 * 三条 mutation，外加一个「把三处错误一起清掉」的复位。
 *
 * 三条都开 `suppressErrorToast`：失败原因要留在对话框里、挨着那一行项目说，
 * 而不是甩到页角的 toast 里——那时对话框还开着，人正盯着这张表看。
 */
function useMembershipMutations() {
	const invalidate = useInvalidateMembership();

	const addMutation = useMutation(
		orpc.projectMembers.add.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: (member) => invalidate(member.projectId),
		})
	);
	const removeMutation = useMutation(
		orpc.projectMembers.remove.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: (result) => invalidate(result.projectId),
		})
	);
	const roleMutation = useMutation(
		orpc.projectMembers.updateRole.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: (member) => invalidate(member.projectId),
		})
	);

	/*
	 * 每发起一个新动作前先把三条一起复位：对外的 error 是三条合并出来的一个值，
	 * 上一次失败那句话不清掉，就会挂在这一次的动作底下，读起来像是刚刚又失败了。
	 */
	const resetAll = useCallback(() => {
		addMutation.reset();
		removeMutation.reset();
		roleMutation.reset();
	}, [addMutation, removeMutation, roleMutation]);

	return { addMutation, removeMutation, resetAll, roleMutation };
}

/** 绑定到某一个用户的三条过程。整份文件的推导见顶部。 */
export function useUserProjectActions(userId: string): UserProjectActions {
	const { addMutation, removeMutation, resetAll, roleMutation } =
		useMembershipMutations();

	const add = useCallback(
		(projectId: string, role: ProjectRole) => {
			resetAll();
			addMutation.mutate({ projectId, role, userId });
		},
		[addMutation, resetAll, userId]
	);

	const remove = useCallback(
		(projectId: string) => {
			resetAll();
			removeMutation.mutate({ projectId, userId });
		},
		[removeMutation, resetAll, userId]
	);

	const setRole = useCallback(
		(projectId: string, role: ProjectRole) => {
			resetAll();
			roleMutation.mutate({ projectId, role, userId });
		},
		[resetAll, roleMutation, userId]
	);

	return {
		add,
		error: (addMutation.error ?? removeMutation.error ?? roleMutation.error)
			?.message,
		isPending:
			addMutation.isPending ||
			removeMutation.isPending ||
			roleMutation.isPending,
		remove,
		setRole,
	};
}
