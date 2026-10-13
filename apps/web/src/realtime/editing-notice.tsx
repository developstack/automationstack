import { Alert, AlertTitle } from "@automationstack/ui/components/alert";
import { PencilLineIcon } from "lucide-react";

import { useCaseEditors } from "./use-editing";

const NAME_SEPARATOR = "、";

interface CaseEditingNoticeProps {
	caseId: string | undefined;
}

/**
 * 其他人正在编辑这条用例时的提示。status 区域一直存在，只替换其中的内容，
 * 读屏软件才会读出变化。
 */
export function CaseEditingNotice({ caseId }: CaseEditingNoticeProps) {
	const editors = useCaseEditors(caseId);
	const active = editors.length > 0;
	return (
		<div className={active ? undefined : "sr-only"} role="status">
			{active ? (
				<Alert role="none" variant="warning">
					<PencilLineIcon aria-hidden="true" />
					<AlertTitle className="font-normal">{`${editors.join(NAME_SEPARATOR)} 正在编辑此用例，保存时可能发生冲突。`}</AlertTitle>
				</Alert>
			) : null}
		</div>
	);
}
