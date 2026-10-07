const ISSUE_KEY_PATTERN = /^([A-Za-z][A-Za-z0-9]{1,9})-([1-9]\d*)$/;

const URL_PATH_KEY_PATTERN =
	/\/(?:browse|issues)\/([A-Za-z][A-Za-z0-9]{1,9}-[1-9]\d*)/;

const SELECTED_ISSUE_KEYS = ["selectedIssue", "issueKey", "selectedIssueKey"];

const TRAILING_SLASHES_PATTERN = /\/+$/;

function normalizeKey(value: string): string | null {
	const matched = ISSUE_KEY_PATTERN.exec(value.trim());
	if (matched === null) {
		return null;
	}
	const [, projectKey, issueNumber] = matched;
	if (projectKey === undefined || issueNumber === undefined) {
		return null;
	}
	return `${projectKey.toUpperCase()}-${issueNumber}`;
}

function parseFromUrl(raw: string): string | null {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	const fromPath = URL_PATH_KEY_PATTERN.exec(url.pathname)?.[1];
	if (fromPath !== undefined) {
		return normalizeKey(fromPath);
	}
	for (const parameter of SELECTED_ISSUE_KEYS) {
		const value = url.searchParams.get(parameter);
		if (value !== null) {
			const key = normalizeKey(value);
			if (key !== null) {
				return key;
			}
		}
	}
	return null;
}

export function parseIssueKey(input: string): string | null {
	const trimmed = input.trim();
	if (trimmed === "") {
		return null;
	}
	if (trimmed.includes("://")) {
		return parseFromUrl(trimmed);
	}
	return normalizeKey(trimmed);
}

export function normalizeSiteUrl(siteUrl: string): string {
	return siteUrl.trim().replace(TRAILING_SLASHES_PATTERN, "");
}

export function buildIssueUrl(siteUrl: string, issueKey: string): string {
	return `${normalizeSiteUrl(siteUrl)}/browse/${issueKey}`;
}
