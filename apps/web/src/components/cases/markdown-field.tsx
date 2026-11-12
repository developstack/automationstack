import { Label } from "@automationstack/ui/components/label";
import { Textarea } from "@automationstack/ui/components/textarea";
import type { EditorView } from "@codemirror/view";
import { ClientOnly } from "@tanstack/react-router";
import { type ChangeEvent, lazy, Suspense, useCallback, useState } from "react";
import {
	MARKDOWN_EDITOR_BODY_CLASS,
	MARKDOWN_EDITOR_FRAME_CLASS,
	MARKDOWN_TOOLBAR_CLASS,
} from "@/components/cases/markdown-editor-classes";
import { useFocusOut } from "@/components/cases/markdown-field-focus";
import { MarkdownFieldUploads } from "@/components/cases/markdown-field-uploads";
import { MarkdownPreviewPane } from "@/components/cases/markdown-preview-pane";
import {
	type FieldActivation,
	loadedMarkdownEditor,
	useFieldActivation,
} from "@/components/cases/use-markdown-field-activation";
import {
	type MarkdownFieldPaste,
	useMarkdownFieldPaste,
} from "@/components/cases/use-markdown-field-paste";

const LazyMarkdownCodeEditor = lazy(async () => {
	const editorModule = await import("@/components/cases/markdown-code-editor");
	return { default: editorModule.MarkdownCodeEditor };
});

const EDITOR_FALLBACK = (
	<div aria-hidden="true" className={MARKDOWN_EDITOR_FRAME_CLASS}>
		<div className={MARKDOWN_EDITOR_BODY_CLASS} />
		<div className={MARKDOWN_TOOLBAR_CLASS} />
	</div>
);

const TEXTAREA_CLASS = "text-sm leading-relaxed";

const PLAIN_CLASS = "flex w-full min-w-0 flex-col";

const INPUT_COLUMN_CLASS = "flex min-w-0 flex-col gap-1.5";

const SPLIT_CLASS = "grid grid-cols-1 items-start gap-3 sm:grid-cols-2";

const STACK_CLASS = "flex w-full min-w-0 flex-col gap-3";

function layoutClass(preview: boolean | undefined, visible: boolean): string {
	if (!visible) {
		return PLAIN_CLASS;
	}
	return preview === undefined ? SPLIT_CLASS : STACK_CLASS;
}

interface MarkdownFieldControlProps {
	ariaLabel: string;
	id?: string;
	onChange: (value: string) => void;
	/** 传入时，粘贴的图片交给它处理（例如加入操作截图），不写入文字。 */
	onPasteImages?: (files: File[]) => void;
	placeholder: string;
	preview?: boolean;
	value: string;
}

interface MarkdownFieldProps extends MarkdownFieldControlProps {
	label?: string;
}

interface MarkdownFieldInputProps {
	activation: FieldActivation;
	ariaLabel: string;
	id?: string;
	onChange: (value: string) => void;
	onTextareaChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
	onView: (view: EditorView | null) => void;
	paste: MarkdownFieldPaste;
	placeholder: string;
	value: string;
}

function MarkdownFieldInput({
	activation,
	ariaLabel,
	id,
	onChange,
	onTextareaChange,
	onView,
	paste,
	placeholder,
	value,
}: MarkdownFieldInputProps) {
	if (activation.editing) {
		const Editor = loadedMarkdownEditor() ?? LazyMarkdownCodeEditor;
		return (
			<ClientOnly fallback={EDITOR_FALLBACK}>
				<Suspense fallback={EDITOR_FALLBACK}>
					<Editor
						ariaLabel={ariaLabel}
						initialCaret={activation.caretRef.current}
						onChange={onChange}
						onEscape={activation.handleEscape}
						onPasteFiles={paste.handlePasteFiles}
						onView={onView}
						placeholder={placeholder}
						value={value}
					/>
				</Suspense>
			</ClientOnly>
		);
	}
	return (
		<Textarea
			aria-label={id === undefined ? ariaLabel : undefined}
			className={TEXTAREA_CLASS}
			id={id}
			onChange={onTextareaChange}
			onClick={activation.handleClick}
			onFocus={activation.handleFocus}
			onPaste={paste.handleTextareaPaste}
			placeholder={placeholder}
			ref={activation.textareaRef}
			value={value}
		/>
	);
}

/** 编辑器显示和关闭时，告诉粘贴和焦点两部分。 */
function useEditorViewHandler(
	activation: FieldActivation,
	paste: MarkdownFieldPaste
) {
	const { handleEditorView } = activation;
	const { setView } = paste;
	return useCallback(
		(view: EditorView | null) => {
			setView(view);
			handleEditorView(view);
		},
		[handleEditorView, setView]
	);
}

function MarkdownFieldControl({
	ariaLabel,
	id,
	onChange,
	onPasteImages,
	placeholder,
	preview,
	value,
}: MarkdownFieldControlProps) {
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const activation = useFieldActivation();
	useFocusOut(container, activation.handleFocusOut);
	const paste = useMarkdownFieldPaste({
		onChange,
		onPasteImages,
		textareaRef: activation.textareaRef,
		value,
	});

	const handleTextareaChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
		[onChange]
	);

	const handleView = useEditorViewHandler(activation, paste);

	const previewVisible = preview ?? activation.editing;

	return (
		<div className={layoutClass(preview, previewVisible)} ref={setContainer}>
			<div className={INPUT_COLUMN_CLASS}>
				<MarkdownFieldInput
					activation={activation}
					ariaLabel={ariaLabel}
					id={id}
					onChange={onChange}
					onTextareaChange={handleTextareaChange}
					onView={handleView}
					paste={paste}
					placeholder={placeholder}
					value={value}
				/>
				<MarkdownFieldUploads
					onRemoveRef={paste.removeUploadingRef}
					onReturnFocus={paste.focusField}
					text={value}
				/>
			</div>
			{previewVisible ? <MarkdownPreviewPane text={value} /> : null}
		</div>
	);
}

export function MarkdownField({ label, ...control }: MarkdownFieldProps) {
	if (label === undefined) {
		return <MarkdownFieldControl {...control} />;
	}
	return (
		<div className="flex w-full flex-col gap-2">
			<Label className="text-sm" htmlFor={control.id}>
				{label}
			</Label>
			<MarkdownFieldControl {...control} />
		</div>
	);
}
