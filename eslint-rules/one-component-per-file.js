import { isVendoredUiComponent } from "../scripts/vendored-ui.js";
import {
	isComponentFunction,
	isComponentName,
	toKebabCase,
	unwrapComponentFunction,
} from "./component-detect.js";

const MAX_PRIVATE_HELPERS = 2;

const NAME_CHECK_EXEMPT_BASENAMES = new Set(["index"]);

const GENERATED_FILES = ["apps/web/src/routeTree.gen.ts"];

const TEST_FILE_PATTERN = /\.(test|spec)\.[jt]sx?$/;
const FILE_EXT_PATTERN = /\.[jt]sx?$/;

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
		exportedNames.add(declaration.name);
		return;
	}
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
