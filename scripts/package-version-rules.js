/**
 * package.json 依赖版本规则的**判定**部分：位置匹配 + 值白名单。
 *
 * 从 scripts/check-package-json.js 拆出来，理由是行数上限——那边留的是 CLI
 * （读文件、拼报错、决定退出码），这边是纯函数、没有 IO 也没有 process。
 * 两边合起来才是原来那一个文件，唯一的调用方仍然是那个 CLI。
 *
 * 拆开的附带好处：这一侧可以被直接 import 来做断言，不必每次都起一个子进程。
 */

/**
 * 哪些位置放的是「依赖名 → 版本」。
 *
 * 按**完整路径形状**匹配，而不是只看顶层键名：`pnpm.overrides` 埋在第二层、
 * `pnpm.packageExtensions.<包名>.dependencies` 埋在第四层，只看 path[0]
 * 两个都会漏。按形状匹配同时挡住了误报：`peerDependenciesMeta` 这类
 * 同前缀、但值不是版本号的字段不会命中。
 *
 * `"*"` 是通配段，匹配任意一段——packageExtensions 底下那一层是被扩展的
 * 包名（形如 `react-redux@1`），枚举不了。
 *
 * 刻意**不**收录 `pnpm.peerDependencyRules.allowedVersions`：
 * 那里写范围是它的正常用法，管它才是误报。
 */
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

/**
 * overrides 家族的值允许再套一层（npm 的嵌套 overrides 写法），
 * 所以这两条用前缀匹配而不是等长匹配。
 */
const NESTABLE_DEPENDENCY_SECTIONS = [["overrides"], ["pnpm", "overrides"]];

/** `"*"` 匹配任意一段；其余段必须逐字相等。 */
function pathMatchesPrefix(path, pattern) {
	return (
		path.length >= pattern.length &&
		pattern.every(
			(segment, index) => segment === "*" || path[index] === segment
		)
	);
}

/** currentPath 的最后一段是依赖名，它前面的才是 section。 */
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

/**
 * 精确 semver：主.次.补，可带 `-预发布` 与 `+构建元数据`。
 * 顶层字面量，不要挪进函数里反复构造。
 */
const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** `npm:<包名>@<版本>` 别名；版本段单独抓出来，递归走同一条规则。 */
const NPM_ALIAS = /^npm:(?:@[^/@\s]+\/)?[^/@\s]+@(.+)$/;

/**
 * `workspace:` 里允许的两种：`workspace:*` 与 `workspace:<精确 semver>`。
 *
 * 刻意**不**放行 `workspace:^` / `workspace:~`——它们是合法的 pnpm 写法，
 * 但 publish 时的替换规则是 `workspace:^ → ^1.2.3`、`workspace:~ → ~1.2.3`，
 * 也就是把 caret 写进发给外部消费者的 manifest。这个仓要往 GitHub Packages
 * 发 SDK，那正是这条策略要禁的东西，只是在仓外生效。
 * 只有 `workspace:*` 会被替换成钉死的 `1.2.3`。
 */
const WORKSPACE_PROTOCOL = "workspace:";

/**
 * **白名单**：只认下面四种写法，其余一律拒。
 *
 * 这里刻意是闭世界的，因为文件头那句规格（「必须使用固定版本」）本来就是
 * 闭世界的。原来的实现是开世界的——「禁止 ^ ~ latest * > < =」——
 * 于是 `1.x`、`1.2.3 - 2.0.0`、`1.2.3 || 1.2.4`、`""`、`beta`
 * 这些同样不是固定版本的写法全部放行；最难看的是
 * `npm:lodash-es@^4.17.21`：`^` 就在字符串里，只是不在第 0 位，
 * `startsWith` 就够不着。**黑名单漏的永远是没写进名单的那一类。**
 *
 * 同理，协议前缀本身不能代替对值的判定：`workspace:` 与 `npm:` 都是
 * 「前缀对了，后面那截还得自己走一遍规则」，否则就是在闭合旧洞的同一次
 * 改动里开一个新洞。`catalog:` 是唯一的例外，理由见文件头第三段。
 *
 * 有意不放行 `file:` / `link:` / `git+…#<sha>`：全仓一例都没有。
 * `git+…#<40 位 sha>` 确实是钉死的，但钉死只是这条策略买到的性质之一——
 * 这几种协议都不走 registry 解析，版本对仓里其余工具（catalog、发布检查）
 * 一概不可见。拒掉它们是把所有依赖留在其余工具看得懂的那一条解析路径上。
 * 将来真要用，让它红一次、显式改这里，比预留一个从没被验证过的口子安全。
 */
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
		// 别名的版本段必须自己也是精确 semver，否则 npm: 就成了绕过通道。
		// 正则要求必须有 `@版本` 那一段：`npm:bar` 不匹配，于是落到下面的 false——
		// 它等价于 `npm:bar@latest`，「切不出版本段就放行」会把 latest 放进来。
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

/**
 * 递归走整棵 JSON。位置与值两条判定都在这里合流：
 * `isDependencyVersionPath` 管「这个字符串是不是一个依赖版本」，
 * `isAllowedVersion` 管「这个版本写法允不允许」。
 */
export function checkDependencyVersions(
	obj,
	path = [],
	counter = { checked: 0 }
) {
	const issues = [];

	for (const [key, value] of Object.entries(obj)) {
		const currentPath = [...path, key];

		if (typeof value === "object" && value !== null) {
			// 递归检查嵌套对象
			issues.push(...checkDependencyVersions(value, currentPath, counter));
		} else if (
			typeof value === "string" &&
			isDependencyVersionPath(currentPath)
		) {
			// 先记数再判对错：这个数要证明的是「匹配器命中过」，
			// 跟命中之后判成合规还是违规无关。
			counter.checked += 1;
			if (isAllowedVersion(value)) {
				continue;
			}
			issues.push({
				dependency: key,
				reason: getVersionErrorReason(value),
				// 违规位置要带上 section，否则同名依赖出现在两处时看不出说的是哪一处
				section: currentPath.slice(0, -1).join("."),
				version: value,
			});
		}
	}

	return issues;
}
