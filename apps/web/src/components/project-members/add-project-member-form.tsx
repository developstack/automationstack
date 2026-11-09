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
import { Link } from "@tanstack/react-router";
import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import { ProjectMemberFormError } from "@/components/project-members/project-member-form-error";
import { orpc } from "@/utils/orpc";

const CANDIDATE_FIELD_ID = "project-member-candidate";
const NO_CANDIDATE_HINT_ID = "project-member-no-candidate";
const NO_CANDIDATE = "__none__";

interface CandidateOption {
	label: string;
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
	describedBy: string | undefined;
	onChange: (userId: string) => void;
	options: readonly CandidateOption[];
	value: string;
}

function CandidateField({
	describedBy,
	onChange,
	options,
	value,
}: CandidateFieldProps) {
	const handleValueChange = useCallback(
		(next: string | null) => onChange(next ?? NO_CANDIDATE),
		[onChange]
	);

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={CANDIDATE_FIELD_ID}>账号</Label>
			<Select items={options} onValueChange={handleValueChange} value={value}>
				<SelectTrigger
					aria-describedby={describedBy}
					className="w-full"
					id={CANDIDATE_FIELD_ID}
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
		</div>
	);
}

/** 所有账号都已经在项目里时，说明原因，并给出新建账号的入口。 */
function NoCandidateHint() {
	return (
		<p className="text-muted-foreground text-xs" id={NO_CANDIDATE_HINT_ID}>
			没有可以添加的账号：所有账号都已经在本项目中。先到
			<Link className="underline underline-offset-4" to="/users">
				用户
			</Link>
			页面新建账号，再回到这里添加。
		</p>
	);
}

function buildCandidateOptions(
	isPending: boolean,
	candidates: readonly { id: string; username: string }[]
): CandidateOption[] {
	return [
		{
			label: isPending ? "载入中…" : "选择一个账号（已在项目里的不再列出）",
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

/** 表单的状态：候选账号、选中的账号和提交。 */
function useAddMemberForm(projectId: string, onClose: () => void) {
	const add = useAddMember(projectId, onClose);
	const candidatesQuery = useQuery(
		orpc.projectMembers.listCandidates.queryOptions({ input: { projectId } })
	);
	const [userId, setUserId] = useState(NO_CANDIDATE);
	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (userId !== NO_CANDIDATE) {
				add.mutate({ projectId, userId });
			}
		},
		[add, projectId, userId]
	);
	return {
		errorMessage: add.error?.message ?? candidatesQuery.error?.message,
		handleSubmit,
		isPending: add.isPending,
		noCandidates: candidatesQuery.data?.length === 0,
		options: buildCandidateOptions(
			candidatesQuery.isPending,
			candidatesQuery.data ?? []
		),
		setUserId,
		userId,
	};
}

export function AddProjectMemberForm({
	onClose,
	projectId,
}: AddProjectMemberFormProps) {
	const form = useAddMemberForm(projectId, onClose);

	return (
		<form
			className="flex flex-col gap-4"
			noValidate={true}
			onSubmit={form.handleSubmit}
		>
			<CandidateField
				describedBy={form.noCandidates ? NO_CANDIDATE_HINT_ID : undefined}
				onChange={form.setUserId}
				options={form.options}
				value={form.userId}
			/>
			{form.noCandidates ? <NoCandidateHint /> : null}
			<ProjectMemberFormError message={form.errorMessage} />
			<DialogFooter>
				<Button onClick={onClose} type="button" variant="outline">
					取消
				</Button>
				<Button
					disabled={form.isPending || form.userId === NO_CANDIDATE}
					type="submit"
				>
					{form.isPending ? "添加中…" : "添加"}
				</Button>
			</DialogFooter>
		</form>
	);
}
