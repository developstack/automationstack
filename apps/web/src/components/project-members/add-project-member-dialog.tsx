import type { ProjectRole } from "@automationstack/db/schema/project-members";
import { Button } from "@automationstack/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";
import { Label } from "@automationstack/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@automationstack/ui/components/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import { MemberFormError } from "@/components/members/member-form-fields";
import { PROJECT_ROLE_OPTIONS } from "@/components/project-members/project-member-meta";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";
import { orpc } from "@/utils/orpc";

const CANDIDATE_FIELD_ID = "project-member-candidate";
const ROLE_FIELD_ID = "project-member-role";
/**
 * 「还没选人」的哨兵值。
 * Base UI 的 Select 用 null 表示未选中，而未选中态在这张表里要有一行可见的
 * 提示文字（空触发器看不出是没选还是加载失败），所以照 ai-module-select 的做法
 * 用一个假选项占位，提交前再把它当作校验失败。
 */
const NO_CANDIDATE = "__none__";

interface CandidateOption {
	label: string;
	value: string;
}

function useAddMember(projectId: string, onClose: () => void) {
	const queryClient = useQueryClient();
	return useMutation(
		orpc.projectMembers.add.mutationOptions({
			// 「该用户已经是项目成员」这类失败要留在对话框里挨着下拉框说
			meta: { suppressErrorToast: true },
			onSuccess: () => {
				const input = { projectId };
				queryClient.invalidateQueries({
					queryKey: orpc.projectMembers.list.key({ input }),
				});
				// 刚加进来的人必须从候选里消失，否则下拉框还留着他
				queryClient.invalidateQueries({
					queryKey: orpc.projectMembers.listCandidates.key({ input }),
				});
				toast.success("成员已添加");
				onClose();
			},
		})
	);
}

interface CandidateFieldProps {
	onChange: (userId: string) => void;
	options: readonly CandidateOption[];
	value: string;
}

function CandidateField({ onChange, options, value }: CandidateFieldProps) {
	const handleValueChange = useCallback(
		// Base UI 的清空动作会给 null，此时退回哨兵值而不是掉进未定义状态
		(next: string | null) => onChange(next ?? NO_CANDIDATE),
		[onChange]
	);

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={CANDIDATE_FIELD_ID}>账号</Label>
			<Select items={options} onValueChange={handleValueChange} value={value}>
				<SelectTrigger className="w-full" id={CANDIDATE_FIELD_ID}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

interface RoleFieldProps {
	onChange: (role: ProjectRole) => void;
	value: ProjectRole;
}

function RoleField({ onChange, value }: RoleFieldProps) {
	const handleValueChange = useCallback(
		(next: string | null) => {
			if (next === "member" || next === "owner") {
				onChange(next);
			}
		},
		[onChange]
	);

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={ROLE_FIELD_ID}>项目角色</Label>
			<Select
				items={PROJECT_ROLE_OPTIONS}
				onValueChange={handleValueChange}
				value={value}
			>
				<SelectTrigger className="w-full" id={ROLE_FIELD_ID}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{PROJECT_ROLE_OPTIONS.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

/**
 * 候选人下拉的选项：第一项永远是那个占位的哨兵。
 *
 * 加载中与「一个候选都没有」共用这一行提示：两种情况下都没得选，差别只在
 * 提示文字，而分成两条渲染路径会让下拉框在数据到达那一帧整个换掉一次。
 */
function buildCandidateOptions(
	isPending: boolean,
	candidates: readonly { id: string; username: string }[]
): CandidateOption[] {
	return [
		{
			label: isPending ? "载入中…" : "选择一个平台账号（已在项目里的不再列出）",
			value: NO_CANDIDATE,
		},
		...candidates.map((candidate) => ({
			label: candidate.username,
			value: candidate.id,
		})),
	];
}

interface AddProjectMemberFormProps {
	onClose: () => void;
	projectId: string;
}

function AddProjectMemberForm({
	onClose,
	projectId,
}: AddProjectMemberFormProps) {
	const candidatesQuery = useQuery(
		orpc.projectMembers.listCandidates.queryOptions({ input: { projectId } })
	);
	const add = useAddMember(projectId, onClose);
	const [role, setRole] = useState<ProjectRole>("member");
	const [userId, setUserId] = useState(NO_CANDIDATE);
	const options = buildCandidateOptions(
		candidatesQuery.isPending,
		candidatesQuery.data ?? []
	);

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (userId === NO_CANDIDATE) {
				return;
			}
			add.mutate({ projectId, role, userId });
		},
		[add, projectId, role, userId]
	);

	return (
		<form
			className="flex flex-col gap-4"
			noValidate={true}
			onSubmit={handleSubmit}
		>
			<CandidateField onChange={setUserId} options={options} value={userId} />
			<RoleField onChange={setRole} value={role} />
			<MemberFormError message={add.error?.message} />
			<DialogFooter>
				<Button onClick={onClose} type="button" variant="outline">
					取消
				</Button>
				{/*
				 * 没选人时按钮禁用，而不是提交后再报一句「请选择账号」：这张表只有
				 * 一个必填项，禁用态本身就说清了差什么。
				 */}
				<Button
					disabled={add.isPending || userId === NO_CANDIDATE}
					type="submit"
				>
					{add.isPending ? "添加中…" : "添加"}
				</Button>
			</DialogFooter>
		</form>
	);
}

interface AddProjectMemberDialogProps {
	onClose: () => void;
	open: boolean;
	projectId: string;
}

/**
 * 添加成员：从平台账号里挑一个人，定他在本项目里的角色。
 *
 * 候选人走 `projectMembers.listCandidates` 而不是 `users.list`——后者是
 * `adminProcedure`，项目 owner 调不动（完整理由见那条过程与它背后查询的注释）。
 * 这里不提供「新建平台账号」的入口：账号由平台管理员统一创建（设置页的
 * 「平台账号」那格），项目 owner 只是从已有的人里挑，两件事的作用域不同。
 */
export function AddProjectMemberDialog({
	onClose,
	open,
	projectId,
}: AddProjectMemberDialogProps) {
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>添加成员</DialogTitle>
					<DialogDescription>
						把一个已有的平台账号加进本项目；他登录后就能看到这个项目。
					</DialogDescription>
				</DialogHeader>
				{/* 只在打开时挂载：关闭后重新打开是一张干净的表，不留上次的选择与错误 */}
				{open ? (
					<AddProjectMemberForm onClose={onClose} projectId={projectId} />
				) : null}
			</DialogContent>
		</Dialog>
	);
}
