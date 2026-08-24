/**
 * 用例行的附件区：粘贴 / 拖拽 / 选文件三条入口 + 已传列表。
 *
 * 三条入口必须都在：粘贴是截图后最顺手的动作，拖拽适合录屏文件，
 * 而**选文件是唯一键盘可达的那条**——只做前两个等于把这个功能对键盘用户关掉。
 */
import { Button } from "@automationstack/ui/components/button";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { cn } from "@automationstack/ui/lib/utils";
import { ImageIcon, PaperclipIcon, Trash2Icon, UploadIcon } from "lucide-react";
import {
	type ChangeEvent,
	type DragEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import {
	ATTACHMENT_ACCEPT_ATTRIBUTE,
	ATTACHMENT_ACCEPT_HINT,
	MAX_ATTACHMENT_HINT,
} from "@/components/test-runs/attachment-policy";
import {
	useAttachmentList,
	useRemoveAttachment,
	useUploadAttachments,
} from "@/components/test-runs/use-attachment-upload";

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
	const isImage = contentType.startsWith("image/");

	return (
		<li className="flex items-center gap-2 rounded-md border p-2">
			{/*
			 * 缩略图只用后端现签的 url。**fileName 绝不参与任何 URL / 路径拼接**：
			 * 它是用户可控字符串，只做文本展示。
			 */}
			{isImage && url !== null ? (
				// 宽高写死成与 size-10 一致的 40px：给出显式尺寸才不会在缩略图
				// 加载完成的瞬间把整行往下顶（CLS）。
				<img
					alt={`附件 ${fileName} 的缩略图`}
					className="size-10 shrink-0 rounded object-cover"
					height={THUMBNAIL_PX}
					src={url}
					width={THUMBNAIL_PX}
				/>
			) : (
				<span className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
					{isImage ? (
						<ImageIcon aria-hidden="true" className="size-4" />
					) : (
						<PaperclipIcon aria-hidden="true" className="size-4" />
					)}
				</span>
			)}
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
					onClick={handleRemove}
					type="button"
					variant="ghost"
				>
					<Trash2Icon aria-hidden="true" />
				</Button>
			) : null}
		</li>
	);
}

export interface RunAttachmentsProps {
	/** 已提交的测试任务：只能看，不能传也不能删。 */
	locked: boolean;
	onStorageUnavailable: () => void;
	/**
	 * 当前结论下附件区是否常驻（失败 / 阻塞才是 true）。false 时**一条附件都没有**
	 * 就整块不渲染。这个判断只能落在这一层：附件列表是这里自己查的，
	 * 父组件不知道有几条，为了这个再发一次同样的查询不值当。
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
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);

	const canUpload = !(locked || storageUnavailable);
	const uploadFiles = useCallback(
		(files: readonly File[]) => {
			if (canUpload && files.length > 0) {
				upload.mutate(files);
			}
		},
		[canUpload, upload]
	);

	/**
	 * 粘贴挂在 document 上而不是某个容器上：用户截完图的动作是「回到页面按
	 * Ctrl+V」，不会先去点一下附件区。挂在容器上要求焦点已经在里面，
	 * 那条路径几乎没人会走，等于这个功能不存在。
	 *
	 * 代价是页面上任何位置的粘贴都会被接走，所以只在**确实带文件**的
	 * clipboardData 上动手——粘贴文字（比如往说明框里贴一段日志）完全不受影响。
	 */
	useEffect(() => {
		if (!canUpload) {
			return;
		}
		const onPaste = (event: ClipboardEvent) => {
			const files = [...(event.clipboardData?.files ?? [])];
			if (files.length === 0) {
				return;
			}
			event.preventDefault();
			uploadFiles(files);
		};
		document.addEventListener("paste", onPaste);
		return () => document.removeEventListener("paste", onPaste);
	}, [canUpload, uploadFiles]);

	const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
		// 不 preventDefault 的话浏览器会直接用文件替换整个页面
		event.preventDefault();
		setDragging(true);
	}, []);
	const handleDragLeave = useCallback(() => setDragging(false), []);
	const handleDrop = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			event.preventDefault();
			setDragging(false);
			uploadFiles([...event.dataTransfer.files]);
		},
		[uploadFiles]
	);

	const handlePick = useCallback(() => inputRef.current?.click(), []);
	const handleInputChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			uploadFiles([...(event.target.files ?? [])]);
			// 清空 value：连续两次选同一个文件时 change 事件不会再触发
			event.target.value = "";
		},
		[uploadFiles]
	);
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
		<section className="flex flex-col gap-2">
			<h3 className="font-medium text-sm">附件</h3>
			{canUpload ? (
				// 拖放是纯指针增强：键盘用户走下面那颗「选择文件」按钮，粘贴走
				// document 上的 paste 监听。给这个容器安一个 button role 只会向
				// 读屏宣告一个按回车毫无反应的控件，比不加 role 更糟，所以这里
				// 明确抑制这两条规则，而不是造一个假控件。
				// biome-ignore lint/a11y/noStaticElementInteractions: 见上，拖放区没有等价的可聚焦语义
				// biome-ignore lint/a11y/noNoninteractiveElementInteractions: 同上，键盘路径由「选择文件」按钮承担
				<div
					className={cn(
						"flex flex-col items-center gap-2 rounded-md border border-dashed p-4 text-center",
						dragging && "border-primary bg-accent"
					)}
					onDragLeave={handleDragLeave}
					onDragOver={handleDragOver}
					onDrop={handleDrop}
				>
					<p className="text-muted-foreground text-xs">
						把截图 / 录屏拖到这里，或直接 Ctrl+V 粘贴
					</p>
					<Button
						aria-disabled={upload.isPending || undefined}
						onClick={upload.isPending ? undefined : handlePick}
						type="button"
						variant="outline"
					>
						<UploadIcon aria-hidden="true" data-icon="inline-start" />
						{upload.isPending ? "上传中…" : "选择文件"}
					</Button>
					<p className="text-muted-foreground text-xs">
						{ATTACHMENT_ACCEPT_HINT}，单个不超过 {MAX_ATTACHMENT_HINT}
					</p>
					<input
						accept={ATTACHMENT_ACCEPT_ATTRIBUTE}
						className="sr-only"
						multiple={true}
						onChange={handleInputChange}
						ref={inputRef}
						tabIndex={-1}
						type="file"
					/>
				</div>
			) : null}
			{storageUnavailable && !locked && (
				// 禁用而不说明原因等于什么都没说；这条不影响打结论，只是传不了图。
				<p className="rounded-md border border-dashed p-3 text-muted-foreground text-xs">
					附件存储（R2）未配置，暂时无法上传附件。结论、说明与缺陷关联都不受影响，
					可以让管理员在服务端补上 R2 配置后再补传。
				</p>
			)}
			{listQuery.isPending ? <Skeleton className="h-14 w-full" /> : null}
			{items.length > 0 ? (
				<ul className="flex flex-col gap-2">
					{items.map(({ attachment, url }) => (
						<AttachmentRow
							contentType={attachment.contentType}
							fileName={attachment.fileName}
							id={attachment.id}
							key={attachment.id}
							onRemove={handleRemove}
							removable={!locked}
							sizeBytes={attachment.sizeBytes}
							url={url}
						/>
					))}
				</ul>
			) : null}
		</section>
	);
}
