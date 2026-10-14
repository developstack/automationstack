/**
 * Markdown 编辑区的外框与工具栏。编辑器加载前的占位使用同一个外框和工具栏高度，
 * 加载完成时布局不跳动。外框的边框、阴影和焦点环与 Textarea 一致。
 */
export const MARKDOWN_EDITOR_FRAME_CLASS =
	"flex w-full min-w-0 flex-col overflow-hidden rounded-md border border-input bg-transparent shadow-xs transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30";

export const MARKDOWN_EDITOR_BODY_CLASS = "min-h-16";

export const MARKDOWN_TOOLBAR_CLASS =
	"flex min-h-8 flex-wrap items-center gap-0.5 border-input border-t bg-muted/50 px-1 py-0.5 dark:bg-muted/30";
