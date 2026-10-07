import {
	REASON_FIELD_TEXT,
	REASON_NOTE_CLASSES,
	type ReasonKind,
} from "@/components/test-runs/run-step-reason";

export function StepReasonNote({
	kind,
	value,
}: {
	kind: ReasonKind;
	value: string;
}) {
	return (
		<p
			className={`mt-3 whitespace-pre-wrap break-words rounded-md px-2 py-1.5 text-xs ${REASON_NOTE_CLASSES[kind]}`}
		>
			<span className="font-medium">{`${REASON_FIELD_TEXT[kind].label}：`}</span>
			{value}
		</p>
	);
}
