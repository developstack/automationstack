import { Button } from "@automationstack/ui/components/button";
import {
	type FocusEvent,
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { flushSync } from "react-dom";

interface InlineConfirmProps {
	confirmLabel: string;
	onConfirm: () => void;
	pending: boolean;
	prompt: string;
	triggerAriaLabel?: string;
	triggerIcon?: ReactNode;
	triggerLabel: string;
}

interface InlineConfirmState {
	cancel: () => void;
	cancelRef: RefObject<HTMLButtonElement | null>;
	confirming: boolean;
	groupRef: RefObject<HTMLDivElement | null>;
	handleBlur: (event: FocusEvent<HTMLButtonElement>) => void;
	start: () => void;
	triggerRef: RefObject<HTMLButtonElement | null>;
}

/**
 * 在确认区域里按 Esc 时取消。用原生监听：按钮不可用（提交中）时，
 * Base UI 不会调用按钮上的 onKeyDown。阻止冒泡后，Esc 不会传到外层，
 * 例如关闭用例所在的抽屉。
 */
function useEscapeToCancel(
	groupRef: RefObject<HTMLDivElement | null> | null,
	cancel: () => void
) {
	useEffect(() => {
		const group = groupRef?.current ?? null;
		const handleKeyDown = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Escape") {
				event.stopPropagation();
				cancel();
			}
		};
		group?.addEventListener("keydown", handleKeyDown);
		return () => group?.removeEventListener("keydown", handleKeyDown);
	}, [cancel, groupRef]);
}

function useInlineConfirm(pending: boolean): InlineConfirmState {
	const [confirming, setConfirming] = useState(false);
	const cancelRef = useRef<HTMLButtonElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const groupRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (confirming) {
			cancelRef.current?.focus();
		}
	}, [confirming]);

	const start = useCallback(() => setConfirming(true), []);
	const cancel = useCallback(() => {
		if (!pending) {
			// 先渲染出触发按钮，再把焦点还给它
			flushSync(() => setConfirming(false));
			triggerRef.current?.focus();
		}
	}, [pending]);
	useEscapeToCancel(confirming ? groupRef : null, cancel);
	// 只在焦点移到确认区域外的元素时收起。Safari 点击按钮时不聚焦按钮，
	// relatedTarget 为 null，这时收起会让点击落空
	const handleBlur = useCallback(
		(event: FocusEvent<HTMLButtonElement>) => {
			const next = event.relatedTarget;
			const leftGroup =
				next instanceof Node && !(groupRef.current?.contains(next) ?? false);
			if (leftGroup && !pending) {
				setConfirming(false);
			}
		},
		[pending]
	);

	return {
		cancel,
		cancelRef,
		confirming,
		groupRef,
		handleBlur,
		start,
		triggerRef,
	};
}

/**
 * 删除一条数据的二次确认：点击按钮后在原位显示确认，不弹出对话框。
 * 焦点先落在「取消」上，连按 Enter 不会直接删除。
 * Esc、「取消」或焦点移到确认区域外都会回到原来的按钮；提交中保持确认。
 */
export function InlineConfirm(props: InlineConfirmProps) {
	const { pending } = props;
	const state = useInlineConfirm(pending);
	// 焦点落在「取消」上时，读屏软件通过 aria-describedby 读出提示
	const promptId = useId();

	if (!state.confirming) {
		return (
			<Button
				aria-label={props.triggerAriaLabel}
				onClick={state.start}
				ref={state.triggerRef}
				size="sm"
				variant="ghost"
			>
				{props.triggerIcon}
				{props.triggerLabel}
			</Button>
		);
	}

	return (
		<div className="flex items-center gap-2" ref={state.groupRef}>
			<span className="text-destructive text-sm" id={promptId}>
				{props.prompt}
			</span>
			<Button
				onBlur={state.handleBlur}
				onClick={props.onConfirm}
				pending={pending}
				size="sm"
				variant="destructive"
			>
				{props.confirmLabel}
			</Button>
			<Button
				aria-describedby={promptId}
				disabled={pending}
				focusableWhenDisabled={true}
				onBlur={state.handleBlur}
				onClick={state.cancel}
				ref={state.cancelRef}
				size="sm"
				variant="ghost"
			>
				取消
			</Button>
		</div>
	);
}
