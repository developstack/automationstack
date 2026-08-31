/**
 * 已传附件的列表：一条都没有就整块不渲染，有就把每一条交给 `AttachmentRow`。
 *
 * 与 `attachment-row.tsx` 原先合住在 `run-attachment-row.tsx`，那个文件的私有
 * 辅助组件超过了一个文件 2 个的上限、文件名也与唯一的对外组件对不上，于是按
 * 各自的组件名分成了两个文件。行长什么样、以及这条边界的由来都在那边。
 */
import { AttachmentRow } from "@/components/test-runs/attachment-row";

/**
 * `testRunAttachments.list` 返回项里这一层用得到的那几个字段。
 *
 * 只声明用到的字段而不是复用后端的行类型：多出来的字段（storageKey 之类）
 * 结构化赋值本来就放行，而把它们写进来等于宣称这一层关心它们。
 */
export interface AttachmentListItem {
	attachment: {
		contentType: string;
		fileName: string;
		id: string;
		sizeBytes: number;
	};
	url: string | null;
}

export interface AttachmentListProps {
	items: readonly AttachmentListItem[];
	onRemove: (id: string) => void;
	/** 已提交的测试任务：只能看，不能删。 */
	removable: boolean;
}

export function AttachmentList({
	items,
	onRemove,
	removable,
}: AttachmentListProps) {
	// 空列表整条不渲染，而不是渲染一个空 <ul>：外层 section 是 flex-col + gap-2，
	// 高度为 0 的 <ul> 仍然算一个 flex item，会在上传框与下一块之间吃掉一份
	// gap，留出一道解释不了的空隙。这条判断原本在调用方，跟着 <ul> 一起搬过来。
	if (items.length === 0) {
		return null;
	}

	return (
		<ul className="flex flex-col gap-2">
			{items.map(({ attachment, url }) => (
				<AttachmentRow
					contentType={attachment.contentType}
					fileName={attachment.fileName}
					id={attachment.id}
					key={attachment.id}
					onRemove={onRemove}
					removable={removable}
					sizeBytes={attachment.sizeBytes}
					url={url}
				/>
			))}
		</ul>
	);
}
