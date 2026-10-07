import {
	type JiraFieldGroupProps,
	shown,
} from "@/components/settings/jira-field-group";
import { JiraTextField } from "@/components/settings/jira-text-field";

const PROJECT_KEY_ID = "settings-jira-project-key";
const ISSUE_TYPE_ID = "settings-jira-issue-type";

export function JiraProjectFields(props: JiraFieldGroupProps) {
	return (
		<>
			<JiraTextField
				error={shown(props.submitted, props.errors.projectKey)}
				id={PROJECT_KEY_ID}
				label="project key"
				onValueChange={props.handlers.projectKey}
				pending={props.pending}
				placeholder="PAY"
				type="text"
				value={props.values.projectKey}
			/>
			<JiraTextField
				error={shown(props.submitted, props.errors.defaultIssueType)}
				id={ISSUE_TYPE_ID}
				label="默认 issue 类型"
				onValueChange={props.handlers.defaultIssueType}
				pending={props.pending}
				placeholder="Bug"
				type="text"
				value={props.values.defaultIssueType}
			/>
		</>
	);
}
