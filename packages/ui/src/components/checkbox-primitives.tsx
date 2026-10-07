"use client";

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
