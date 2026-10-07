import { Button } from "@automationstack/ui/components/button";
import { Input } from "@automationstack/ui/components/input";
import { BugIcon } from "lucide-react";

import {
	useCreateDefect,
	useDefectLinkForm,
} from "@/components/test-runs/run-defect-mutations";

interface LinkFieldText {
	label: string;
	placeholder: string;
}

function linkFieldText(jiraConfigured: boolean): LinkFieldText {
	if (jiraConfigured) {
		return {
			label: "Jira issue 编号或链接",
			placeholder: "PAY-123 或 https://your.atlassian.net/browse/PAY-123",
		};
	}
	return {
		label: "缺陷链接",
		placeholder: "https://…（贴上你们缺陷系统里的链接）",
	};
}

interface LinkFormProps {
	jiraConfigured: boolean;
	runCaseId: string;
}

function LinkForm({ jiraConfigured, runCaseId }: LinkFormProps) {
	const { handleChange, handleSubmit, link, reference } =
		useDefectLinkForm(runCaseId);
	const { label, placeholder } = linkFieldText(jiraConfigured);

	return (
		<form className="flex items-end gap-2" onSubmit={handleSubmit}>
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<label className="text-muted-foreground text-xs" htmlFor="defect-ref">
					{label}
				</label>
				<Input
					id="defect-ref"
					onChange={handleChange}
					placeholder={placeholder}
					value={reference}
				/>
			</div>
			<Button
				aria-disabled={link.isPending || reference.trim() === "" || undefined}
				type="submit"
				variant="outline"
			>
				关联
			</Button>
		</form>
	);
}

function CreateDefectButton({ runCaseId }: { runCaseId: string }) {
	const { create, handleClick } = useCreateDefect(runCaseId);
	return (
		<Button
			aria-disabled={create.isPending || undefined}
			onClick={create.isPending ? undefined : handleClick}
			type="button"
			variant="outline"
		>
			<BugIcon aria-hidden="true" data-icon="inline-start" />
			{create.isPending ? "创建中…" : "创建 Jira Issue"}
		</Button>
	);
}

export interface DefectLinkActionsProps {
	credentialBroken: boolean;
	jiraConfigured: boolean;
	runCaseId: string;
}

export function DefectLinkActions({
	credentialBroken,
	jiraConfigured,
	runCaseId,
}: DefectLinkActionsProps) {
	return (
		<div className="flex flex-col gap-2">
			{jiraConfigured ? <CreateDefectButton runCaseId={runCaseId} /> : null}
			<LinkForm jiraConfigured={jiraConfigured} runCaseId={runCaseId} />
			{credentialBroken ? (
				<p className="text-muted-foreground text-xs">
					本项目的 Jira 凭据当前不可用，暂时无法自动建单；可以先手工填链接。
				</p>
			) : null}
		</div>
	);
}
