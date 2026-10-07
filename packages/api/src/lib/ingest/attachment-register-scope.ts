import type { IngestAttachmentRegisterRejection } from "./attachment-contract";
import {
	type AttachmentRegisterGroup,
	buildRegisterRejections,
} from "./attachment-register-plan";

export const REASON_PROJECT_FORBIDDEN =
	"这枚 token 的主人不是该测试任务所属项目的成员，附件未受理";

export interface RegisterScopeSplit {
	allowed: AttachmentRegisterGroup[];
	rejected: IngestAttachmentRegisterRejection[];
}

export function splitRegisterGroupsByAccess(
	groups: AttachmentRegisterGroup[],
	forbiddenRunIds: ReadonlySet<string>
): RegisterScopeSplit {
	const allowed: AttachmentRegisterGroup[] = [];
	const rejected: IngestAttachmentRegisterRejection[] = [];
	for (const group of groups) {
		if (forbiddenRunIds.has(group.runId)) {
			rejected.push(
				...buildRegisterRejections(group.items, REASON_PROJECT_FORBIDDEN)
			);
			continue;
		}
		allowed.push(group);
	}
	return { allowed, rejected };
}
