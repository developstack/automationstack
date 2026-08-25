/**
 * 还没关联时的那一组入口：一键建单（仅已配置 Jira）+ 反向关联表单。
 *
 * 未配置 Jira 时这里只剩表单，而且那个表单就是「手填缺陷链接」——
 * `linkDefect` 在未配置时不发任何外部请求，把输入原样存进 `defectUrl`。
 * 降级形态是常态而不是异常，所以这一组里没有任何「Jira 不可用」的报错 UI。
 */
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

/** 同一个输入框在两套形态下收的东西不一样，文案必须跟着换。 */
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

/** 反向关联表单。未配置 Jira 时它就是「手填缺陷链接」。 */
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

/** 已配置 Jira 时才出现的一键建单。 */
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
				// 「配了但凭据用不了」与「压根没配」要分开说：前者要管理员去重填
				// Token，混为一谈会让人以为配置丢了。这时仍可手工填链接，
				// 打结论的流程一步都不受影响。
				<p className="text-muted-foreground text-xs">
					本项目的 Jira 凭据当前不可用，暂时无法自动建单；可以先手工填链接。
				</p>
			) : null}
		</div>
	);
}
