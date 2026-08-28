/**
 * 用例行的附件区：粘贴 / 拖拽 / 选文件三条入口 + 已传列表。
 *
 * ## 为什么没有「附件」这个小标题
 *
 * 这一块原先是右栏最底下一个带 `<h3>附件</h3>` 的独立段落，用户要求去掉
 * （原话：「最后附件我觉得不要特意在最后还显示……去掉」），改成折进抬头下面的
 * 结论摘要区、跟缺陷并排。折进去之后再顶一个小标题，就等于把刚拆掉的那一段
 * 原样搬了个位置。上传区自己那句「把截图 / 录屏拖到这里」已经说清了这是什么，
 * 已传列表则每行都带文件名与缩略图。
 *
 * 三条入口必须都在：粘贴是截图后最顺手的动作，拖拽适合录屏文件，
 * 而**选文件是唯一键盘可达的那条**——只做前两个等于把这个功能对键盘用户关掉。
 *
 * 这个文件只剩编排。三条入口共用的状态在 `run-attachment-picker.ts`，
 * 上传区的 DOM 在 `run-attachment-dropzone.tsx`，已传列表在
 * `run-attachment-row.tsx`。
 */
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { useCallback } from "react";

import { AttachmentDropZone } from "@/components/test-runs/run-attachment-dropzone";
import { useAttachmentPicker } from "@/components/test-runs/run-attachment-picker";
import { AttachmentList } from "@/components/test-runs/run-attachment-row";
import {
	useAttachmentList,
	useRemoveAttachment,
	useUploadAttachments,
} from "@/components/test-runs/use-attachment-upload";

export interface RunAttachmentsProps {
	/** 已提交的测试任务：只能看，不能传也不能删。 */
	locked: boolean;
	onStorageUnavailable: () => void;
	/**
	 * 当前结论下附件区是否常驻（`needsVerdictDetails`，失败 / 阻塞才是 true）。
	 * false 时**一条附件都没有**就整块不渲染。这个判断只能落在这一层：附件列表是
	 * 这里自己查的，父组件不知道有几条，为了这个再发一次同样的查询不值当。
	 *
	 * 缺陷那块用的是另一条更宽的规则（多一档跳过），两者故意不共用，
	 * 理由写在 `needsVerdictDetails` / `needsDefectLink` 旁边。
	 */
	relevant: boolean;
	runCaseId: string;
	/** R2 未配置：上传入口整体禁用并说明原因，而不是让人点了才报错。 */
	storageUnavailable: boolean;
}

export function RunAttachments({
	locked,
	onStorageUnavailable,
	relevant,
	runCaseId,
	storageUnavailable,
}: RunAttachmentsProps) {
	const listQuery = useAttachmentList(runCaseId);
	const upload = useUploadAttachments({ onStorageUnavailable, runCaseId });
	const remove = useRemoveAttachment(onStorageUnavailable);

	const canUpload = !(locked || storageUnavailable);
	const picker = useAttachmentPicker({ canUpload, upload });
	const handleRemove = useCallback(
		(attachmentId: string) => remove.mutate({ attachmentId }),
		[remove]
	);

	const items = listQuery.data ?? [];

	// 与本结论无关且一条都没传过：整块消失，「通过」的用例不必盯着一个空上传框。
	// 传过的附件永远留着——改判通过时文件还在库里，藏起来就是「数据没了」。
	// 列表还没回来时按空处理：为一个多半空着的区块先闪一段骨架屏更吵。
	if (!(relevant || items.length > 0)) {
		return null;
	}

	return (
		<div className="flex flex-col gap-2">
			{canUpload ? (
				<AttachmentDropZone picker={picker} uploading={upload.isPending} />
			) : null}
			{storageUnavailable && !locked && (
				// 禁用而不说明原因等于什么都没说；这条不影响打结论，只是传不了图。
				<p className="rounded-md border border-dashed p-3 text-muted-foreground text-xs">
					附件存储（R2）未配置，暂时无法上传附件。结论、说明与缺陷关联都不受影响，
					可以让管理员在服务端补上 R2 配置后再补传。
				</p>
			)}
			{listQuery.isPending ? <Skeleton className="h-14 w-full" /> : null}
			<AttachmentList
				items={items}
				onRemove={handleRemove}
				removable={!locked}
			/>
		</div>
	);
}
