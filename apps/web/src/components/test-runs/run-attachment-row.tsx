/**
 * 已传附件的列表与其中的单行：缩略图 + 文件名 / 大小 + 打开 / 删除。
 *
 * 从 `run-attachments.tsx` 拆出来，边界是「编排 vs. 一行长什么样」：那边负责
 * 三条上传入口、列表查询与整块显不显示，这边只管把一条已有的附件画出来。
 * 两者混在一个文件里时这条边界只存在于读者脑子里，改动很容易越界。
 */
import { Button } from "@automationstack/ui/components/button";
import { ImageIcon, PaperclipIcon, Trash2Icon } from "lucide-react";
import { useCallback } from "react";

const BYTES_PER_KIB = 1024;
/** 与 `size-10`（2.5rem = 40px）对齐，用于 img 的显式宽高。 */
const THUMBNAIL_PX = 40;

function formatSize(bytes: number): string {
	if (bytes < BYTES_PER_KIB) {
		return `${bytes} B`;
	}
	const kib = bytes / BYTES_PER_KIB;
	if (kib < BYTES_PER_KIB) {
		return `${Math.round(kib)} KB`;
	}
	return `${(kib / BYTES_PER_KIB).toFixed(1)} MB`;
}

interface AttachmentThumbnailProps {
	contentType: string;
	fileName: string;
	url: string | null;
}

function AttachmentThumbnail({
	contentType,
	fileName,
	url,
}: AttachmentThumbnailProps) {
	const isImage = contentType.startsWith("image/");

	/*
	 * 缩略图只用后端现签的 url。**fileName 绝不参与任何 URL / 路径拼接**：
	 * 它是用户可控字符串，只做文本展示。
	 */
	if (isImage && url !== null) {
		// 宽高写死成与 size-10 一致的 40px：给出显式尺寸才不会在缩略图
		// 加载完成的瞬间把整行往下顶（CLS）。
		// 描边用纯黑/纯白 10%（而不是 slate/zinc 之类的近黑，也不是主题色）：
		// 缩略图内容本身什么颜色都可能有，描边只用来跟底色分开，不该带自己的色相。
		return (
			<img
				alt={`附件 ${fileName} 的缩略图`}
				className="size-10 shrink-0 rounded object-cover outline outline-black/10 dark:outline-white/10"
				height={THUMBNAIL_PX}
				src={url}
				width={THUMBNAIL_PX}
			/>
		);
	}
	return (
		<span className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
			{isImage ? (
				<ImageIcon aria-hidden="true" className="size-4" />
			) : (
				<PaperclipIcon aria-hidden="true" className="size-4" />
			)}
		</span>
	);
}

interface AttachmentRowActionsProps {
	fileName: string;
	/** 已经绑好 id 的删除回调：绑定留在行里，这里不该再知道 id 的存在。 */
	onRemove: () => void;
	removable: boolean;
	url: string | null;
}

function AttachmentRowActions({
	fileName,
	onRemove,
	removable,
	url,
}: AttachmentRowActionsProps) {
	return (
		<>
			{url !== null && (
				<Button
					render={<a href={url} rel="noopener" target="_blank" />}
					variant="ghost"
				>
					打开
				</Button>
			)}
			{removable ? (
				<Button
					aria-label={`删除附件 ${fileName}`}
					onClick={onRemove}
					type="button"
					variant="ghost"
				>
					<Trash2Icon aria-hidden="true" />
				</Button>
			) : null}
		</>
	);
}

interface AttachmentRowProps {
	contentType: string;
	fileName: string;
	id: string;
	onRemove: (id: string) => void;
	removable: boolean;
	sizeBytes: number;
	url: string | null;
}

function AttachmentRow({
	contentType,
	fileName,
	id,
	onRemove,
	removable,
	sizeBytes,
	url,
}: AttachmentRowProps) {
	const handleRemove = useCallback(() => onRemove(id), [id, onRemove]);

	return (
		// bg-card 而不是 border：右栏底面是 bg-muted/40 灰画布，同一画布上的卡片
		// 靠 bg-card 亮出来，不是靠描边（同一条理由见 run-step-card.tsx 文件头）。
		<li className="flex items-center gap-2 rounded-md bg-card p-2">
			<AttachmentThumbnail
				contentType={contentType}
				fileName={fileName}
				url={url}
			/>
			<span className="min-w-0 flex-1">
				{/* 文件名可能很长，截断而不换行；title 让完整名字仍可读到 */}
				<span className="block truncate text-sm" title={fileName}>
					{fileName}
				</span>
				<span className="text-muted-foreground text-xs">
					{formatSize(sizeBytes)}
					{url === null && " · 存储不可用，暂时打不开"}
				</span>
			</span>
			<AttachmentRowActions
				fileName={fileName}
				onRemove={handleRemove}
				removable={removable}
				url={url}
			/>
		</li>
	);
}

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
