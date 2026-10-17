import { MAX_NEW_CASE_ATTACHMENTS } from "@automationstack/api/schemas/case";
import { useMemo } from "react";
import { toast } from "sonner";

import type { CaseAttachmentContextValue } from "@/components/cases/case-attachment-context";

/**
 * 新用例一次保存最多引用 MAX_NEW_CASE_ATTACHMENTS 张图片（正文图片、操作截图和预期截图）。
 * 添加图片时先检查：超过上限的图片不上传，并提示上限和现有数量，避免保存时才被服务端拒绝。
 * count 是现有的图片数量，包括上传中的图片（见 caseFormImageCount）。编辑已有用例没有这个上限。
 */
export function useNewCaseImageLimit(
	attachments: CaseAttachmentContextValue,
	count: number
): CaseAttachmentContextValue {
	const { uploadPasted } = attachments;
	return useMemo(() => {
		if (uploadPasted === null) {
			return attachments;
		}
		const room = Math.max(0, MAX_NEW_CASE_ATTACHMENTS - count);
		return {
			...attachments,
			uploadPasted: (files, target) => {
				const accepted = files.slice(0, room);
				const rejected = files.length - accepted.length;
				if (rejected > 0) {
					toast.error(
						`新用例最多 ${MAX_NEW_CASE_ATTACHMENTS} 张图片，现在有 ${count} 张，${rejected} 张没有加入`
					);
				}
				if (accepted.length > 0) {
					uploadPasted(accepted, target);
				}
			},
		};
	}, [attachments, count, uploadPasted]);
}
