import { useCaseAttachments } from "@/components/cases/case-attachment-context";
import { MarkdownRender } from "@/components/cases/markdown-render";

const PANE_CLASS =
	"flex max-h-80 min-w-0 flex-col gap-1 overflow-auto rounded-md border border-input border-dashed bg-muted/30 p-2";

export function MarkdownPreviewPane({ text }: { text: string }) {
	const { imageUrls } = useCaseAttachments();
	const empty = text.trim() === "";

	return (
		<div className={PANE_CLASS}>
			<span className="select-none text-muted-foreground text-xs">预览</span>
			{empty ? (
				<span className="text-muted-foreground text-sm">
					左侧输入的内容会实时显示在这里，粘贴图片也会直接出现。
				</span>
			) : (
				<MarkdownRender imageUrls={imageUrls} text={text} />
			)}
		</div>
	);
}
