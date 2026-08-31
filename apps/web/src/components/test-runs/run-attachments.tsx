/**
 * 这次执行传上来的东西：结果页面上是图本身，修改页面上多一组上传入口。
 *
 * ## 没有「附件」这个模块
 *
 * 它原先是右栏最底下一个带 `<h3>附件</h3>` 的独立段落。用户前后说了两次不要
 * （第二次的原话：「附件不是都跟你说了，用户有贴图就显示，没贴图就不要显示了。
 * 直接显示在结果里面，为什么还要做一个附件这个模块呢？」）。所以：
 *
 * - 结果页面：传了图就把图摊出来，一张都没有就**整块不渲染**——没有标题、
 *   没有空框、没有占位；
 * - 修改页面：上传入口照给。用户嫌的是多出来一个模块，不是不要传图，
 *   把入口一起砍掉等于把这个功能关了。
 *
 * 三条入口必须都在：粘贴是截图后最顺手的动作，拖拽适合录屏文件，
 * 而**选文件是唯一键盘可达的那条**——只做前两个等于把这个功能对键盘用户关掉。
 *
 * 这个文件只剩编排。三条入口共用的状态在 `run-attachment-picker.ts`，
 * 上传区的 DOM 在 `run-attachment-dropzone.tsx`，图在 `run-attachment-gallery.tsx`，
 * 非图片附件的列表在 `attachment-list.tsx`、其中的一行在 `attachment-row.tsx`。
 */
import { useCallback } from "react";

import { AttachmentList } from "@/components/test-runs/attachment-list";
import { AttachmentDropZone } from "@/components/test-runs/run-attachment-dropzone";
import {
	AttachmentGallery,
	isViewableImage,
} from "@/components/test-runs/run-attachment-gallery";
import { useAttachmentPicker } from "@/components/test-runs/run-attachment-picker";
import {
	useAttachmentList,
	useRemoveAttachment,
	useUploadAttachments,
} from "@/components/test-runs/use-attachment-upload";

export interface RunAttachmentsProps {
	/**
	 * 修改页面才有上传与删除。`editing` 已经蕴含「这个任务能改」
	 * （`useVerdictEditingMode` 的一票否决），所以这里不再单收一个 `locked`：
	 * 同一件事有两个开关，迟早会出现一个开着一个关着。
	 */
	editing: boolean;
	onStorageUnavailable: () => void;
	runCaseId: string;
	/** R2 未配置：上传入口整体禁用并说明原因，而不是让人点了才报错。 */
	storageUnavailable: boolean;
}

export function RunAttachments({
	editing,
	onStorageUnavailable,
	runCaseId,
	storageUnavailable,
}: RunAttachmentsProps) {
	const listQuery = useAttachmentList(runCaseId);
	const upload = useUploadAttachments({ onStorageUnavailable, runCaseId });
	const remove = useRemoveAttachment(onStorageUnavailable);

	const canUpload = editing && !storageUnavailable;
	const picker = useAttachmentPicker({ canUpload, upload });
	const handleRemove = useCallback(
		(attachmentId: string) => remove.mutate({ attachmentId }),
		[remove]
	);

	const items = listQuery.data ?? [];
	// 结果页面上一张都没有：整块消失。列表还没回来时按空处理——为一个多半空着的
	// 区块先闪一段骨架屏更吵。
	if (!(editing || items.length > 0)) {
		return null;
	}

	// 图摊开、别的列成行；两边加起来是全集，理由见 `isViewableImage` 旁边。
	const images = items.filter(isViewableImage);
	const files = items.filter((item) => !isViewableImage(item));

	return (
		<div className="flex flex-col gap-2">
			{canUpload ? (
				<AttachmentDropZone picker={picker} uploading={upload.isPending} />
			) : null}
			{editing && storageUnavailable ? (
				// 禁用而不说明原因等于什么都没说；这条不影响打结论，只是传不了图。
				<p className="rounded-md border border-dashed p-3 text-muted-foreground text-xs">
					附件存储（R2）未配置，暂时无法上传附件。结论、说明与缺陷关联都不受影响，
					可以让管理员在服务端补上 R2 配置后再补传。
				</p>
			) : null}
			{/*
			 * 加载态不摆骨架——这正是本文件开头那句「为一个多半空着的区块先闪一段
			 * 骨架屏更吵」的直接后果，此前那条 `h-14 w-full` 与它自相矛盾：
			 * 绝大多数用例一张图都没有，灰条闪完随即消失，等于凭空多一次跳动。
			 */}
			<AttachmentGallery
				items={images}
				onRemove={handleRemove}
				removable={editing}
			/>
			<AttachmentList
				items={files}
				onRemove={handleRemove}
				removable={editing}
			/>
		</div>
	);
}
