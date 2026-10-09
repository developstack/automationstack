import { TriangleAlertIcon } from "lucide-react";

import {
	type AuthSettingsSaveProblem,
	SAVE_PROBLEM_TITLES,
} from "@/components/auth-settings/auth-connection-checks-meta";

/** 保存失败的提示。放在保存按钮上方，失败的步骤显示在「测试连接」中。 */
export function AuthSaveProblemNotice({
	problem,
}: {
	problem: AuthSettingsSaveProblem;
}) {
	return (
		<div
			className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-destructive text-xs"
			role="alert"
		>
			<TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
			<div className="flex flex-col gap-1">
				<p className="font-medium">{SAVE_PROBLEM_TITLES[problem.kind]}</p>
				<p>{problem.message}</p>
			</div>
		</div>
	);
}
