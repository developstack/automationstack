/**
 * 「点保存/创建」那一刻要对表单做的两件纯计算：**还有没有图没传完**、
 * **哪些图真的还被引用着**。
 *
 * 单独成文件（不碰 React、不碰网络）是为了能直接单测——这两条判断都是那种
 * 「线上出问题时没人复现得了」的类型：一个决定正文里会不会永久留下死引用，
 * 另一个决定库里会不会多出一批没人引用的附件行。
 *
 * `hasUnfinishedCaseUploads` 两条路都用（新建 + 编辑已有用例），
 * `referencedCaseAttachments` 只有新建那条路需要——编辑那条路的图在
 * `register` 那一刻就已经落库了，没有「待登记清单」这回事。
 */
import { extractCaseAttachmentIds } from "@automationstack/api/lib/case-attachment-ref";

import type { CaseDraftAttachment } from "@/components/cases/case-draft-parse";
import type { CaseFormValues } from "@/components/cases/case-meta";
import { hasCaseUploadingRef } from "@/components/cases/case-upload-placeholder";

/**
 * 表单里**全部**会被存成正文的文本字段。
 *
 * 三处都要扫：前置条件、每一步的操作、每一步的预期——三个格子都能粘图
 * （见 `case-attachment-context.tsx`）。漏掉任何一个，那一格里的图就会被当成
 * 「没人引用」而不予登记，保存后变成一张永远签不出 URL 的破图。
 */
function caseFormTexts(values: CaseFormValues): string[] {
	const texts = [values.preconditions];
	for (const step of values.steps) {
		texts.push(step.step, step.expected);
	}
	return texts;
}

/**
 * 正文里还残留 `![](uploading:<token>)`。
 *
 * 保存按钮在图没传完时本来就是禁用的，这条是**第二道防线**：按钮可以用回车绕过
 * （表单里任意输入框按 Enter 都会提交），而一旦带着占位提交，抽屉就关了——
 * 上传回来时既找不到编辑器也找不到那份表单值，正文里会永久留下一处渲染成
 * 「图片上传中…」的死引用，并且跟着被冻进 v1 的版本快照。
 */
export function hasUnfinishedCaseUploads(values: CaseFormValues): boolean {
	return caseFormTexts(values).some(hasCaseUploadingRef);
}

/**
 * 从待登记清单里挑出**正文里仍然引用着**的那些。
 *
 * 用户完全可能贴了图又把那段删掉。删掉的那张不登记：R2 上会留一个孤儿对象
 * （仓库已明确接受的代价，见 `db/schema/case-attachments.ts` 文件头），
 * 但数据库里不会多出一行永远没人引用、也没人敢删的附件记录。
 *
 * ⚠️ `extractCaseAttachmentIds` **不去重**（它服务的另一种用法是「按顺序逐处
 * 替换成 `<img>`」，那里重复必须各替各的），所以这里自己收进 Set。
 * 也正因为要去重，才不能拿它的返回长度当「有几张图」用。
 */
export function referencedCaseAttachments(
	values: CaseFormValues,
	pending: readonly CaseDraftAttachment[]
): CaseDraftAttachment[] {
	const referenced = new Set<string>();
	for (const text of caseFormTexts(values)) {
		for (const id of extractCaseAttachmentIds(text)) {
			referenced.add(id);
		}
	}
	return pending.filter((attachment) => referenced.has(attachment.id));
}
