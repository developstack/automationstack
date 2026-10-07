const DEPENDENCY_SECTIONS = [
	["dependencies"],
	["devDependencies"],
	["peerDependencies"],
	["optionalDependencies"],
	["resolutions"],
	["pnpm", "packageExtensions", "*", "dependencies"],
	["pnpm", "packageExtensions", "*", "peerDependencies"],
	["pnpm", "packageExtensions", "*", "optionalDependencies"],
];

const NESTABLE_DEPENDENCY_SECTIONS = [["overrides"], ["pnpm", "overrides"]];

function pathMatchesPrefix(path, pattern) {
	return (
		path.length >= pattern.length &&
		pattern.every(
			(segment, index) => segment === "*" || path[index] === segment
		)
	);
}

export function isDependencyVersionPath(currentPath) {
	const section = currentPath.slice(0, -1);
	const exact = DEPENDENCY_SECTIONS.some(
		(pattern) =>
			pattern.length === section.length && pathMatchesPrefix(section, pattern)
	);
	if (exact) {
		return true;
	}
	return NESTABLE_DEPENDENCY_SECTIONS.some((pattern) =>
		pathMatchesPrefix(section, pattern)
	);
}

const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const NPM_ALIAS = /^npm:(?:@[^/@\s]+\/)?[^/@\s]+@(.+)$/;

const WORKSPACE_PROTOCOL = "workspace:";

export function isAllowedVersion(version) {
	if (EXACT_SEMVER.test(version)) {
		return true;
	}
	if (version.startsWith(WORKSPACE_PROTOCOL)) {
		const spec = version.slice(WORKSPACE_PROTOCOL.length);
		return spec === "*" || EXACT_SEMVER.test(spec);
	}
	if (version.startsWith("catalog:")) {
		return true;
	}
	const alias = NPM_ALIAS.exec(version);
	if (alias) {
		return EXACT_SEMVER.test(alias[1]);
	}
	return false;
}

export function getVersionErrorReason(version) {
	if (version.startsWith("^")) {
		return "使用 ^ 前缀";
	}
	if (version.startsWith("~")) {
		return "使用 ~ 前缀";
	}
	if (version === "latest") {
		return "使用 latest";
	}
	if (version === "*" || version === "x" || version === "") {
		return "等价于任意版本";
	}
	if (version.startsWith("npm:")) {
		return "别名的版本段不是固定版本";
	}
	if (version.startsWith(WORKSPACE_PROTOCOL)) {
		return "workspace: 后面不是 * 或精确版本（发布时会变成范围版本）";
	}
	if (
		version.startsWith(">") ||
		version.startsWith("<") ||
		version.startsWith("=") ||
		version.includes("||") ||
		version.includes(" - ")
	) {
		return "使用范围版本";
	}
	return "不是固定版本号";
}

export function checkDependencyVersions(
	obj,
	path = [],
	counter = { checked: 0 }
) {
	const issues = [];

	for (const [key, value] of Object.entries(obj)) {
		const currentPath = [...path, key];

		if (typeof value === "object" && value !== null) {
			issues.push(...checkDependencyVersions(value, currentPath, counter));
		} else if (
			typeof value === "string" &&
			isDependencyVersionPath(currentPath)
		) {
			counter.checked += 1;
			if (isAllowedVersion(value)) {
				continue;
			}
			issues.push({
				dependency: key,
				reason: getVersionErrorReason(value),
				section: currentPath.slice(0, -1).join("."),
				version: value,
			});
		}
	}

	return issues;
}
