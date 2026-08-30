"use client";

/* Animate UI 的 base checkbox primitive（上游 registry/primitives/base/checkbox），
   vendored 进来。除了 tooltip-primitives.tsx 里那套共同出入（包名 / props 类型 /
   reduced-motion）之外，这个组件多两处按 1.7.0 实际 API 的调整：

   1. render 用 motion.span，不是上游的 motion.button。1.7.0 的 Checkbox.Root
      默认渲染 <span> 加一个隐藏 <input>，nativeButton 默认 false；换成真 <button>
      而不把 nativeButton 设成 true，Base UI 会照非原生按钮那套补 role/键盘处理，
      开发期直接告警，而且表单里一个没有 type 的 <button> 是提交按钮。
      保留 span 也让现有 className（peer、after:* 的扩大点击区）语义不变。
   2. Indicator 的 keepMounted 写在展开之后。勾要画得出来，SVG 就得一直在 DOM 里，
      这是实现细节不是调用方的选项。 */

import { useControlledState } from "@automationstack/ui/hooks/use-controlled-state";
import { getStrictContext } from "@automationstack/ui/lib/get-strict-context";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { motion, type Transition, useReducedMotion } from "motion/react";

const DRAW: Transition = { delay: 0.2, duration: 0.2 };
const ERASE: Transition = { duration: 0.2 };
const PRESS_SCALE = 0.95;
const HOVER_SCALE = 1.05;

interface CheckboxContextType {
	isChecked: boolean;
	isIndeterminate: boolean | undefined;
	setIsChecked: CheckboxProps["onCheckedChange"];
}

const [CheckboxProvider, useCheckbox] =
	getStrictContext<CheckboxContextType>("CheckboxContext");

type CheckboxProps = CheckboxPrimitive.Root.Props;

function Checkbox({ ...props }: CheckboxProps) {
	const reduce = useReducedMotion();
	const [isChecked, setIsChecked] = useControlledState({
		defaultValue: props.defaultChecked,
		onChange: props.onCheckedChange,
		value: props.checked,
	});

	return (
		<CheckboxProvider
			value={{
				isChecked,
				isIndeterminate: props.indeterminate,
				setIsChecked,
			}}
		>
			<CheckboxPrimitive.Root
				data-slot="checkbox"
				{...props}
				onCheckedChange={setIsChecked}
				render={
					<motion.span
						whileHover={reduce ? undefined : { scale: HOVER_SCALE }}
						whileTap={reduce ? undefined : { scale: PRESS_SCALE }}
					/>
				}
			/>
		</CheckboxProvider>
	);
}

type CheckboxIndicatorProps = CheckboxPrimitive.Indicator.Props;

/**
 * 勾本身就是动画：路径按 pathLength 画出来 / 收回去，所以 SVG 直接由
 * Indicator 渲染，不再包一层图标组件。indeterminate 换成一条横线，
 * 它没有「收回」态——Base UI 只在勾选态之间切换时才需要那半拍。
 */
function CheckboxIndicator({ ...props }: CheckboxIndicatorProps) {
	const { isChecked, isIndeterminate } = useCheckbox();
	const reduce = useReducedMotion();

	return (
		<CheckboxPrimitive.Indicator
			data-slot="checkbox-indicator"
			{...props}
			keepMounted
			render={
				<motion.svg
					animate={isChecked ? "checked" : "unchecked"}
					fill="none"
					initial="unchecked"
					stroke="currentColor"
					strokeWidth="3.5"
					viewBox="0 0 24 24"
					xmlns="http://www.w3.org/2000/svg"
				>
					{isIndeterminate ? (
						<motion.line
							animate={{
								opacity: 1,
								pathLength: 1,
								transition: reduce ? { duration: 0 } : ERASE,
							}}
							initial={{ opacity: 0, pathLength: 0 }}
							strokeLinecap="round"
							x1="5"
							x2="19"
							y1="12"
							y2="12"
						/>
					) : (
						<motion.path
							d="M4.5 12.75l6 6 9-13.5"
							strokeLinecap="round"
							strokeLinejoin="round"
							variants={{
								checked: {
									opacity: 1,
									pathLength: 1,
									transition: reduce ? { duration: 0 } : DRAW,
								},
								unchecked: {
									opacity: 0,
									pathLength: 0,
									transition: reduce ? { duration: 0 } : ERASE,
								},
							}}
						/>
					)}
				</motion.svg>
			}
		/>
	);
}

export {
	Checkbox,
	type CheckboxContextType,
	CheckboxIndicator,
	type CheckboxIndicatorProps,
	type CheckboxProps,
	useCheckbox,
};
