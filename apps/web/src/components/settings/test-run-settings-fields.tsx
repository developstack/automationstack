import { Button } from "@automationstack/ui/components/button";
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import type { ChangeEvent } from "react";

import {
	MAX_AUTO_SUBMIT_DAYS,
	MIN_AUTO_SUBMIT_DAYS,
} from "@/components/settings/auto-submit-days";

const FIELD_ID = "settings-auto-submit-days";
const HINT_ID = "settings-auto-submit-days-hint";
const ERROR_ID = "settings-auto-submit-days-error";

export interface TestRunSettingsFieldsProps {
	error: string | null;
	hint: string;
	onChange: (event: ChangeEvent<HTMLInputElement>) => void;
	pending: boolean;
	value: string;
}

export function TestRunSettingsFields(props: TestRunSettingsFieldsProps) {
	return (
		<>
			<div className="flex flex-col gap-2">
				<Label htmlFor={FIELD_ID}>自动提交等待天数</Label>
				<div className="flex items-center gap-2">
					<Input
						aria-describedby={
							props.error === null ? HINT_ID : `${ERROR_ID} ${HINT_ID}`
						}
						aria-invalid={props.error !== null}
						className="w-28"
						disabled={props.pending}
						id={FIELD_ID}
						inputMode="numeric"
						max={MAX_AUTO_SUBMIT_DAYS}
						min={MIN_AUTO_SUBMIT_DAYS}
						onChange={props.onChange}
						step={1}
						type="number"
						value={props.value}
					/>
					<span aria-hidden="true" className="text-muted-foreground text-sm">
						天
					</span>
				</div>
				{props.error === null ? null : (
					<p className="text-destructive text-xs" id={ERROR_ID}>
						{props.error}
					</p>
				)}
				<p className="text-muted-foreground text-xs" id={HINT_ID}>
					{props.hint}
				</p>
			</div>
			<div className="flex justify-end">
				<Button disabled={props.pending} type="submit">
					{props.pending ? "保存中…" : "保存"}
				</Button>
			</div>
		</>
	);
}
