/**
 * 「什么算一个 React 组件」的 AST 判定。
 *
 * 全部走 AST，不用正则匹配源码文本：拿正则扫过一轮的结果是
 * `EMAIL_ID`、`STATUS_FILTER_OPTIONS` 这类 ALL_CAPS 常量会被当成组件，
 * 而 `memo(function Foo(){})` 这类包装反而扫不出来。
 *
 * 判定分两步，两步都成立才算组件：
 *   1. 名字像组件：PascalCase（首字母大写 **且** 含小写字母）。
 *      「含小写字母」这一条专门排掉 SCREAMING_SNAKE_CASE 常量与
 *      `API` / `URL` 这类纯大写缩写。
 *   2. 函数体像组件：函数的所有 return 值都是 JSX 或空值（`null` /
 *      `undefined` / 裸 `return`），且其中至少有一个真的是 JSX。
 *      「至少一个 JSX」排掉 `const Foo = () => null` 这种空壳；
 *      「所有 return 都是 JSX 或空值」排掉 PascalCase 命名的工厂函数。
 *
 * 已知的保守之处（宁可漏判，不可误判）：
 *   - `return content;`（先算好再返回一个标识符）判不出来，会漏掉这个组件。
 *   - class 组件不判（本仓全是函数组件）。
 *   - 定义在另一个函数体内部的组件不算文件级组件，只看顶层声明。
 */

// memo / forwardRef 包装：`const Foo = memo(() => ...)`、
// `const Bar = forwardRef(function Bar(props, ref) {...})`、
// 以及 `React.memo(...)` 的成员访问写法，都要能剥到里面那个函数。
const WRAPPER_NAMES = new Set(["forwardRef", "memo"]);

const FUNCTION_TYPES = new Set([
	"ArrowFunctionExpression",
	"FunctionDeclaration",
	"FunctionExpression",
]);

// 只是包了一层类型/括号的表达式，剥掉不影响判定。
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

/** PascalCase 且不是 ALL_CAPS 常量。 */
export function isComponentName(name) {
	return (
		typeof name === "string" && STARTS_UPPER.test(name) && HAS_LOWER.test(name)
	);
}

/** `CaseTable` → `case-table`；`AIPanel` → `ai-panel`。 */
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

/**
 * 从初始化表达式里剥出「真正的组件函数」。剥不出来（比如 `cva(...)`、
 * `useMemo(...)`、字面量）就返回 null，调用方据此判定不是组件。
 */
export function unwrapComponentFunction(node) {
	const current = stripTransparent(node);
	if (!current) {
		return null;
	}
	if (FUNCTION_TYPES.has(current.type)) {
		return current;
	}
	if (current.type === "CallExpression" && isReactWrapperCall(current)) {
		// memo(forwardRef(...)) 这类嵌套包装靠递归剥完。
		return current.arguments.length > 0
			? unwrapComponentFunction(current.arguments[0])
			: null;
	}
	return null;
}

function* childNodes(node) {
	for (const [key, value] of Object.entries(node)) {
		// `parent` 是 ESLint 回填的反向引用，跟着走会无限递归。
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

/** 收集函数体内属于**本函数**的 return（不下钻到嵌套函数里）。 */
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

/** 返回值分类：`jsx` / `empty`（null、undefined、裸 return）/ `other`。 */
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
		// `cond && <A/>`：左边是条件不是返回值，只看右边。
		// `a ?? <B/>` / `a || <B/>`：两边都可能被返回，按分支处理。
		return node.operator === "&&"
			? classifyReturn(node.right)
			: classifyConditional({ alternate: node.right, consequent: node.left });
	}
	return "other";
}

/** 函数体是否像 React 组件。 */
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
