import type { ProjectRole } from "@automationstack/db/schema/project-members";
import type { UserRole } from "@automationstack/db/schema/users";
import { Button } from "@automationstack/ui/components/button";
import { DialogFooter } from "@automationstack/ui/components/dialog";
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

import { ProjectMemberFormError } from "@/components/project-members/project-member-form-error";
import {
	allowedProjectRole,
	isOwnerIneligible,
	OWNER_NOT_ELIGIBLE_HINT,
	projectRoleOptionsFor,
} from "@/components/project-members/project-member-meta";
import { orpc } from "@/utils/orpc";

const CANDIDATE_FIELD_ID = "project-member-candidate";
const ROLE_FIELD_ID = "project-member-role";
const ROLE_HINT_ID = "project-member-role-hint";
const NO_CANDIDATE = "__none__";

interface CandidateOption {
	label: string;
	platformRole?: UserRole;
	value: string;
}

function useAddMember(projectId: string, onClose: () => void) {
	const queryClient = useQueryClient();
	return useMutation(
		orpc.projectMembers.add.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: () => {
				const input = { projectId };
				queryClient.invalidateQueries({
					queryKey: orpc.projectMembers.list.key({ input }),
				});
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
	platformRole: UserRole | undefined;
	value: ProjectRole;
}

function RoleField({ onChange, platformRole, value }: RoleFieldProps) {
	const options = projectRoleOptionsFor(platformRole);
	// 选了普通用户时没有「拥有者」，在字段下说明原因
	const ownerBlocked = isOwnerIneligible(platformRole);
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
			<Select items={options} onValueChange={handleValueChange} value={value}>
				<SelectTrigger
					aria-describedby={ownerBlocked ? ROLE_HINT_ID : undefined}
					className="w-full"
					id={ROLE_FIELD_ID}
				>
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
			{ownerBlocked ? (
				<p className="text-muted-foreground text-xs" id={ROLE_HINT_ID}>
					{OWNER_NOT_ELIGIBLE_HINT}
				</p>
			) : null}
		</div>
	);
}

function buildCandidateOptions(
	isPending: boolean,
	candidates: readonly {
		id: string;
		platformRole: UserRole;
		username: string;
	}[]
): CandidateOption[] {
	return [
		{
			label: isPending ? "载入中…" : "选择一个平台账号（已在项目里的不再列出）",
			value: NO_CANDIDATE,
		},
		...candidates.map((candidate) => ({
			label: candidate.username,
			platformRole: candidate.platformRole,
			value: candidate.id,
		})),
	];
}

interface AddProjectMemberFormProps {
	onClose: () => void;
	projectId: string;
}

/** 表单里选中的账号和项目角色。 */
function useMemberDraft(projectId: string) {
	const candidatesQuery = useQuery(
		orpc.projectMembers.listCandidates.queryOptions({ input: { projectId } })
	);
	const [role, setRole] = useState<ProjectRole>("member");
	const [userId, setUserId] = useState(NO_CANDIDATE);
	const options = buildCandidateOptions(
		candidatesQuery.isPending,
		candidatesQuery.data ?? []
	);
	const { platformRole } =
		options.find((option) => option.value === userId) ?? {};
	// 只有能成为拥有者的账号可以提交「拥有者」：选了「拥有者」后再换成普通用户，实际提交「成员」。
	const effectiveRole = allowedProjectRole(role, platformRole);
	return { effectiveRole, options, platformRole, setRole, setUserId, userId };
}

export function AddProjectMemberForm({
	onClose,
	projectId,
}: AddProjectMemberFormProps) {
	const add = useAddMember(projectId, onClose);
	const { effectiveRole, options, platformRole, setRole, setUserId, userId } =
		useMemberDraft(projectId);

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (userId === NO_CANDIDATE) {
				return;
			}
			add.mutate({ projectId, role: effectiveRole, userId });
		},
		[add, effectiveRole, projectId, userId]
	);

	return (
		<form
			className="flex flex-col gap-4"
			noValidate={true}
			onSubmit={handleSubmit}
		>
			<CandidateField onChange={setUserId} options={options} value={userId} />
			<RoleField
				onChange={setRole}
				platformRole={platformRole}
				value={effectiveRole}
			/>
			<ProjectMemberFormError message={add.error?.message} />
			<DialogFooter>
				<Button onClick={onClose} type="button" variant="outline">
					取消
				</Button>
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
