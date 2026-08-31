/**
 * 已传附件列表里的一行：缩略图 + 文件名 / 大小 + 打开 / 删除。
 *
 * 从 `run-attachments.tsx` 拆出来，边界是「编排 vs. 一行长什么样」：那边负责
 * 三条上传入口、列表查询与整块显不显示，这边只管把一条已有的附件画出来。
 * 两者混在一个文件里时这条边界只存在于读者脑子里，改动很容易越界。
 *
 * 列表壳子在 `attachment-list.tsx`：两者原先合住在 `run-attachment-row.tsx`，
 * 那个文件的私有辅助组件超过了一个文件 2 个的上限、文件名也与唯一的对外组件
 * 对不上，于是按各自的组件名分成了两个文件。
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

export function AttachmentRow({
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
