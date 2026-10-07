const WRAPPER_NAMES = new Set(["forwardRef", "memo"]);

const FUNCTION_TYPES = new Set([
	"ArrowFunctionExpression",
	"FunctionDeclaration",
	"FunctionExpression",
]);

const TRANSPARENT_TYPES = new Set([
	"TSAsExpression",
	"TSNonNullExpression",
	"TSSatisfiesExpression",
	"TSTypeAssertion",
]);

const STARTS_UPPER = /^[A-Z]/;
const HAS_LOWER = /[a-z]/;
const ACRONYM_BOUNDARY = /([A-Z]+)([A-Z][a-z])/g;
const CAMEL_BOUNDARY = /([a-z0-9])([A-Z])/g;

export function isComponentName(name) {
	return (
		typeof name === "string" && STARTS_UPPER.test(name) && HAS_LOWER.test(name)
	);
}

export function toKebabCase(name) {
	return name
		.replace(ACRONYM_BOUNDARY, "$1-$2")
		.replace(CAMEL_BOUNDARY, "$1-$2")
		.toLowerCase();
}

function stripTransparent(node) {
	let current = node;
	while (current && TRANSPARENT_TYPES.has(current.type)) {
		current = current.expression;
	}
	return current;
}

function isReactWrapperCall(node) {
	const { callee } = node;
	if (callee.type === "Identifier") {
		return WRAPPER_NAMES.has(callee.name);
	}
	return (
		callee.type === "MemberExpression" &&
		callee.object.type === "Identifier" &&
		callee.object.name === "React" &&
		callee.property.type === "Identifier" &&
		WRAPPER_NAMES.has(callee.property.name)
	);
}

export function unwrapComponentFunction(node) {
	const current = stripTransparent(node);
	if (!current) {
		return null;
	}
	if (FUNCTION_TYPES.has(current.type)) {
		return current;
	}
	if (current.type === "CallExpression" && isReactWrapperCall(current)) {
		return current.arguments.length > 0
			? unwrapComponentFunction(current.arguments[0])
			: null;
	}
	return null;
}

function* childNodes(node) {
	for (const [key, value] of Object.entries(node)) {
		if (key === "parent") {
			continue;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				if (item && typeof item.type === "string") {
					yield item;
				}
			}
		} else if (value && typeof value.type === "string") {
			yield value;
		}
	}
}

function collectReturns(node, out) {
	if (node.type === "ReturnStatement") {
		out.push(node.argument);
		return;
	}
	if (FUNCTION_TYPES.has(node.type)) {
		return;
	}
	for (const child of childNodes(node)) {
		collectReturns(child, out);
	}
}

function classifyConditional(node) {
	const left = classifyReturn(node.consequent);
	const right = classifyReturn(node.alternate);
	if (left === "other" || right === "other") {
		return "other";
	}
	return left === "jsx" || right === "jsx" ? "jsx" : "empty";
}

function classifyReturn(rawNode) {
	const node = rawNode === null ? null : stripTransparent(rawNode);
	if (!node) {
		return "empty";
	}
	if (node.type === "JSXElement" || node.type === "JSXFragment") {
		return "jsx";
	}
	if (node.type === "Literal" && node.value === null) {
		return "empty";
	}
	if (node.type === "Identifier" && node.name === "undefined") {
		return "empty";
	}
	if (node.type === "ConditionalExpression") {
		return classifyConditional(node);
	}
	if (node.type === "LogicalExpression") {
		return node.operator === "&&"
			? classifyReturn(node.right)
			: classifyConditional({ alternate: node.right, consequent: node.left });
	}
	return "other";
}

export function isComponentFunction(fn) {
	if (!fn) {
		return false;
	}
	if (fn.body.type !== "BlockStatement") {
		return classifyReturn(fn.body) === "jsx";
	}
	const returns = [];
	for (const statement of fn.body.body) {
		collectReturns(statement, returns);
	}
	let hasJsx = false;
	for (const argument of returns) {
		const kind = classifyReturn(argument);
		if (kind === "other") {
			return false;
		}
		if (kind === "jsx") {
			hasJsx = true;
		}
	}
	return hasJsx;
}
