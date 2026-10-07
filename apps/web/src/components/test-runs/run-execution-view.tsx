import { RunExecutionLayout } from "@/components/test-runs/run-execution-layout";
import {
	type RunExecutionOptions,
	useRunExecution,
} from "@/components/test-runs/run-execution-state";

export interface RunExecutionViewProps extends RunExecutionOptions {
	projectId: string;
}

export function RunExecutionView(props: RunExecutionViewProps) {
	const state = useRunExecution(props);
	return <RunExecutionLayout {...state} projectId={props.projectId} />;
}
