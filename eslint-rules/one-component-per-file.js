/**
 * 一个文件一个组件（方案 C：一个对外组件 + 至多 2 个私有辅助组件）。
 *
 * 三条子规则：
 *   1. 被 `export` 的组件（对外契约）至多 1 个；
 *   2. 同文件里未导出的私有辅助组件至多 2 个；
 *   3. 文件名必须等于那唯一一个对外组件名的 kebab-case
 *      （`case-table.tsx` 里就该是 `CaseTable`）。
 *
 * 为什么私有辅助是「≤2」而不是「严格 1 个组件 1 个文件」：本仓 eslint 开着
 * `max-lines-per-function: 50`，主组件一超行就必须把一段 JSX 抽成函数组件，
 * 而那个抽出来的东西没有任何对外契约、只服务于同文件的主组件。按严格口径，
 * apps/web 要新增约 270 个文件（组件文件从 187 涨到 457），且此后每改一次 UI
 * 都伴随建文件；按这里的口径只有 60 个文件违规。管的是**对外 API 的原子性**，
 * 不是文件个数。
 *
 * 为什么不用 `eslint-plugin-react` 的 `react/no-multi-comp`：那条规则没有
 * 「私有辅助 ≤N」这一档，`ignoreStateless: false` 等于「出现第二个组件就报错」
 * （方案 A 的严格度），会把本口径下 105 个合规文件全判成 error；而为它新增
 * 一个 npm 依赖还要过 scripts/check-package-json.js 的精确版本锁定。
 *
 * 豁免范围与理由见下面的 isExemptFile()。
 */

import { isVendoredUiComponent } from "../scripts/vendored-ui.js";
import {
	isComponentFunction,
	isComponentName,
	toKebabCase,
	unwrapComponentFunction,
} from "./component-detect.js";

const MAX_PRIVATE_HELPERS = 2;

// `index.tsx` 是聚合/入口位，文件名与组件名天然对不上，只跳过第 3 条
// （命名）检查；组件计数照常。
const NAME_CHECK_EXEMPT_BASENAMES = new Set(["index"]);

// 生成物：由插件整体覆盖，为迁就门禁做的任何改动下一次 build 就没了。
// 与 scripts/check-file-rules.js 的 GENERATED_FILES 同一条理由，同样逐条
// 列出完整路径而不是 `*.gen.ts` 通配——豁免的依据是「这个文件由插件覆盖」，
// 不是它的名字。
const GENERATED_FILES = ["apps/web/src/routeTree.gen.ts"];

const TEST_FILE_PATTERN = /\.(test|spec)\.[jt]sx?$/;
const FILE_EXT_PATTERN = /\.[jt]sx?$/;

/**
 * 整文件豁免：
 * - `packages/ui/src/components/`：vendored 的 shadcn 组件原件。复合组件
 *   （`Card` / `CardHeader` / `CardTitle` …）就是它的**既定对外 API**，
 *   `table.tsx`、`dropdown-menu.tsx` 单文件导出 8~21 个组件。本仓已对该目录
 *   豁免行数门禁（scripts/vendored-ui.js），这里是同一条理由的延续：
 *   判定标准应当是「与 registry 一致」，改了就再也 `--diff` 不出来。
 * - 测试文件：一个 spec 里为断言临时搭几个小组件是正常写法，
 *   与「对外 API 原子化」无关。
 * - 生成物：见 GENERATED_FILES。
 */
function isExemptFile(filename) {
	if (isVendoredUiComponent(filename)) {
		return true;
	}
	if (TEST_FILE_PATTERN.test(filename)) {
		return true;
	}
	const normalized = filename.replaceAll("\\", "/");
	return GENERATED_FILES.some((generated) =>
		normalized.endsWith(`/${generated}`)
	);
}

function pushCandidate(found, name, fn, node, exported) {
	if (isComponentName(name) && isComponentFunction(fn)) {
		found.push({ exported, name, node });
	}
}

function readDeclaration(declaration, found, exported) {
	if (declaration.type === "FunctionDeclaration" && declaration.id) {
		pushCandidate(
			found,
			declaration.id.name,
			declaration,
			declaration,
			exported
		);
		return;
	}
	if (declaration.type !== "VariableDeclaration") {
		return;
	}
	for (const declarator of declaration.declarations) {
		if (declarator.id.type !== "Identifier" || !declarator.init) {
			continue;
		}
		pushCandidate(
			found,
			declarator.id.name,
			unwrapComponentFunction(declarator.init),
			declarator,
			exported
		);
	}
}

function readDefaultExport(statement, found, exportedNames) {
	const { declaration } = statement;
	if (declaration.type === "FunctionDeclaration" && declaration.id) {
		readDeclaration(declaration, found, true);
		return;
	}
	if (declaration.type === "Identifier") {
		// `export default Foo`：Foo 的声明在别处，先记名字，最后统一回填。
		exportedNames.add(declaration.name);
		return;
	}
	// 匿名 default（`export default () => <div/>`、`export default memo(...)`）：
	// 没有名字可对，只参与计数，不参与命名检查。
	const fn = unwrapComponentFunction(declaration);
	if (isComponentFunction(fn)) {
		found.push({ exported: true, name: null, node: statement });
	}
}

function readTopLevelStatement(statement, found, exportedNames) {
	if (statement.type === "ExportNamedDeclaration") {
		if (statement.declaration) {
			readDeclaration(statement.declaration, found, true);
			return;
		}
		for (const specifier of statement.specifiers) {
			exportedNames.add(specifier.local.name);
		}
		return;
	}
	if (statement.type === "ExportDefaultDeclaration") {
		readDefaultExport(statement, found, exportedNames);
		return;
	}
	readDeclaration(statement, found, false);
}

/** 只看顶层声明：定义在另一个组件体内的组件不构成文件级的对外契约。 */
function collectFileComponents(program) {
	const found = [];
	const exportedNames = new Set();
	for (const statement of program.body) {
		readTopLevelStatement(statement, found, exportedNames);
	}
	for (const component of found) {
		if (component.name && exportedNames.has(component.name)) {
			component.exported = true;
		}
	}
	return found;
}

const displayName = (component) => component.name ?? "(默认导出)";
const joinNames = (components) => components.map(displayName).join("、");

function reportCount(context, components, limit, messageId) {
	if (components.length <= limit) {
		return;
	}
	const all = joinNames(components);
	const extra = joinNames(components.slice(limit));
	for (const component of components.slice(limit)) {
		context.report({
			data: { all, count: String(components.length), extra },
			messageId,
			node: component.node,
		});
	}
}

function reportFilename(context, component, filename) {
	const normalized = filename.replaceAll("\\", "/");
	// TanStack Start 的 file router：`__root.tsx`、`$projectId.tsx`、
	// `items.$id.tsx` 的文件名是框架强制约定，改不动。与
	// scripts/check-file-rules.js 里跳过 `/routes/` 命名检查是同一条理由。
	// 计数两条仍然适用。
	if (normalized.includes("/routes/")) {
		return;
	}
	const actual = normalized.split("/").pop().replace(FILE_EXT_PATTERN, "");
	if (NAME_CHECK_EXEMPT_BASENAMES.has(actual)) {
		return;
	}
	const expected = toKebabCase(component.name);
	if (actual === expected) {
		return;
	}
	context.report({
		data: { actual, expected, name: component.name },
		messageId: "filenameMismatch",
		node: component.node,
	});
}

/** @type {import('eslint').Rule.RuleModule} */
export const oneComponentPerFile = {
	create(context) {
		if (isExemptFile(context.filename)) {
			return {};
		}
		return {
			"Program:exit"(program) {
				const components = collectFileComponents(program);
				const exported = components.filter((item) => item.exported);
				const privates = components.filter((item) => !item.exported);
				reportCount(context, exported, 1, "tooManyExports");
				reportCount(
					context,
					privates,
					MAX_PRIVATE_HELPERS,
					"tooManyPrivateHelpers"
				);
				if (exported.length === 1 && exported[0].name) {
					reportFilename(context, exported[0], context.filename);
				}
			},
		};
	},
	meta: {
		docs: {
			description:
				"一个文件只允许一个对外组件，外加至多 2 个私有辅助组件；文件名须为对外组件名的 kebab-case",
		},
		messages: {
			filenameMismatch:
				"文件名与唯一对外组件不一致：组件是 {{name}}，文件名应为 {{expected}}（当前 {{actual}}）。",
			tooManyExports:
				"一个文件只允许一个对外组件，这里有 {{count}} 个：{{all}}。请把多出来的 {{extra}} 移到各自的文件。",
			tooManyPrivateHelpers:
				"同文件最多 2 个私有辅助组件，这里有 {{count}} 个：{{all}}。超出的 {{extra}} 请拆成独立文件。",
		},
		schema: [],
		type: "suggestion",
	},
};
