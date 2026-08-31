

> Biome（经 Ultracite 预设）+ ESLint + Lefthook（pre-commit / commit-msg / pre-push）+ 自定义 Node 脚本规则。
> 按顺序执行即可复刻同样的检查效果。最后一节 [附录 A](#附录-a代码规则清单务必标记) 集中列出**所有强制的代码规则**。
> 本文档里面所展示的依赖版本号只是为了说明， 项目要固定依赖版本号这一原理。 并不是让你所有的依赖都设置为相同的版本号。 
> 所有的 DB 操作都需要在 packages/db 下新建 repository 下完成。 不允许在其他项目下引入 db 进行操作
> 遵守前端 file router 的规则。 比如items.tsx 和 items.$id.tsx 指向的是一个页面。 要小心这样的陷阱， 你应该在 items.tsx 中记得设置 outlet
---

## 0. 技术栈与版本（务必锁定固定版本）

| 工具 | 版本 | 作用 |
| --- | --- | --- |
| 包管理器 | `pnpm@10.22.0` | monorepo + catalog |
| 构建编排 | `turbo@2.8.12` | 跨包任务编排 |
| 格式化 / Lint 引擎 | `@biomejs/biome@2.4.15` | 主要格式化 + lint |
| Ultracite | `ultracite@7.8.1` | Biome 的零配置预设封装 |
| 类型 Lint | `eslint@10.4.1` | 类型感知规则（复杂度、行数、魔术数字等） |
| ESLint TS 插件 | `@typescript-eslint/eslint-plugin@8.60.1` | TS 规则 |
| ESLint TS 解析器 | `@typescript-eslint/parser@8.60.1` | TS 解析 |
| import 解析器 | `eslint-import-resolver-typescript@4.4.5` | （依赖，预留） |
| import 插件 | `eslint-plugin-import@2.32.0` | （依赖，预留） |
| Git 钩子 | `lefthook@2.1.9` | pre-commit / commit-msg / pre-push |
| TypeScript | `catalog`（`typescript@6.0.3`） | 类型检查 |

> ⚠️ **关键约束**：本项目有一条自定义规则——`package.json` 中**禁止使用 `^`、`~`、`latest`、`*` 或范围版本**，必须写固定版本号（`workspace:*` 与 `catalog:*` 除外）。上面所有版本都按此约定填写。

---

## 1. 初始化仓库与 monorepo 结构

```bash
# 1.1 初始化 git（钩子依赖 git 仓库）
git init

# 1.2 指定包管理器
corepack enable
corepack prepare pnpm@10.22.0 --activate
```

### 1.3 创建 `pnpm-workspace.yaml`

```yaml
packages:
  - apps/*
  - packages/*
allowBuilds:
  esbuild: true
  msw: true
  lefthook: true          # 允许 lefthook 执行安装脚本（pnpm 默认拦截构建脚本）
catalog:
  # 在此集中声明共享依赖的固定版本，子包用 catalog: 引用
  typescript: 6.0.3
  "@types/node": 22.19.19
  zod: 4.4.3
  dotenv: 17.4.2
  # …按项目需要补充
```

> `allowBuilds.lefthook: true` 很重要：pnpm 10 默认禁止依赖运行 install 脚本，lefthook 需要被允许才能正常安装其原生二进制。

### 1.4 根 `package.json`

```json
{
  "name": "justsayai-finances",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "type": "module",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "check-types": "turbo check-types",
    "check": "ultracite check",
    "fix": "ultracite fix",
    "lint": "eslint . --cache",
    "lint:fix": "eslint . --cache --fix"
  },
  "dependencies": {},
  "devDependencies": {
    "@biomejs/biome": "2.4.15",
    "@typescript-eslint/eslint-plugin": "8.60.1",
    "@typescript-eslint/parser": "8.60.1",
    "eslint": "10.4.1",
    "eslint-import-resolver-typescript": "4.4.5",
    "eslint-plugin-import": "2.32.0",
    "lefthook": "2.1.9",
    "turbo": "2.8.12",
    "typescript": "catalog:",
    "ultracite": "7.8.1"
  },
  "packageManager": "pnpm@10.22.0"
}
```

> 注意：`scripts` 里**没有** `prepare` / `postinstall`。本项目选择**手动安装** git 钩子（见第 5 步）。如果你想 clone 后自动安装，可加 `"prepare": "lefthook install"`。

---

## 2. 安装依赖

```bash
pnpm install
# 若 pnpm 提示 lefthook 的 build script 被忽略：
pnpm approve-builds      # 交互式批准，或确保 pnpm-workspace.yaml 里 allowBuilds.lefthook: true
```

---

## 3. 配置 Biome（经 Ultracite）

### 3.1 在根目录创建 `biome.json`

完整内容如下（**逐字复制**）：

```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "vcs": {
    "enabled": false,
    "clientKind": "git",
    "useIgnoreFile": false
  },
  "files": {
    "ignoreUnknown": false,
    "includes": [
      "!**/.next",
      "!**/dist",
      "!**/.turbo",
      "!**/.nx",
      "!**/dev-dist",
      "!**/.zed",
      "!**/.vscode",
      "!**/routeTree.gen.ts",
      "!**/src-tauri",
      "!**/.nuxt",
      "bts.jsonc",
      "!**/.expo",
      "!**/.wrangler",
      "!**/.alchemy",
      "!**/.svelte-kit",
      "!**/wrangler.jsonc",
      "!**/.source",
      "!**/convex/_generated"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "tab"
  },
  "assist": {
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "useExhaustiveDependencies": "info",
        "noUnusedImports": "error",
        "noUnusedVariables": "error"
      },
      "nursery": {
        "useSortedClasses": {
          "level": "warn",
          "fix": "safe",
          "options": {
            "functions": ["clsx", "cva", "cn"]
          }
        }
      },
      "style": {
        "noParameterAssign": "error",
        "useAsConstAssertion": "error",
        "useDefaultParameterLast": "error",
        "useEnumInitializers": "error",
        "useSelfClosingElements": "error",
        "useSingleVarDeclarator": "error",
        "noUnusedTemplateLiteral": "error",
        "useNumberNamespace": "error",
        "noInferrableTypes": "error",
        "noUselessElse": "error",
        "useNodejsImportProtocol": "error"
      },
      "suspicious": {
        "noExplicitAny": "error",
        "noArrayIndexKey": "error",
        "noConsole": "warn",
        "noDebugger": "error"
      },
      "complexity": {
        "noForEach": "warn",
        "noStaticOnlyClass": "error",
        "useLiteralKeys": "error",
        "noUselessSwitchCase": "error",
        "noUselessTernary": "error",
        "noBannedTypes": "error"
      },
      "performance": {
        "noAccumulatingSpread": "error",
        "noBarrelFile": "warn"
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double"
    }
  },
  "css": {
    "parser": {
      "tailwindDirectives": true
    }
  },
  "overrides": [
    {
      "includes": ["**/*.ts", "**/*.tsx"],
      "linter": {
        "rules": {
          "suspicious": {
            "noExplicitAny": "error"
          }
        }
      }
    }
  ],
  "extends": ["ultracite/biome/core", "ultracite/biome/react"]
}
```

要点说明：
- `extends: ["ultracite/biome/core", "ultracite/biome/react"]` —— 继承 Ultracite 的严格预设（核心 + React），上面 `linter.rules` 是在预设之上的**项目自定义覆盖/加严**。
- 缩进用 **tab**，JS/TS 字符串用**双引号**。
- 自动整理 import（`organizeImports: on`）。
- Tailwind 类名排序（`useSortedClasses`，识别 `clsx` / `cva` / `cn`）。

### 3.2 验证 Biome

```bash
pnpm exec ultracite check     # 只读检查
pnpm exec ultracite fix       # 自动修复
pnpm exec ultracite doctor    # 诊断配置/冲突
```

---

## 4. 配置 ESLint（类型感知规则）

Biome 不做的事（函数行数、圈复杂度、魔术数字、参数个数、嵌套深度、非空断言、`consistent-return`）交给 ESLint。

### 4.1 在根目录创建 `eslint.config.js`（flat config，ESM）

```js
/** @type {import('eslint').Linter.Config} */
export default [
	{
		ignores: [
			"**/node_modules/**",
			"**/dist/**",
			"**/build/**",
			"**/.next/**",
			"**/.turbo/**",
			"**/*.config.{js,ts}",
			"**/routeTree.gen.ts",
		],
	},
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			parser: await import("@typescript-eslint/parser"),
			parserOptions: {
				ecmaVersion: "latest",
				sourceType: "module",
				project: ["./**/tsconfig.json"],
			},
		},
		plugins: {
			"@typescript-eslint": (await import("@typescript-eslint/eslint-plugin"))
				.default,
		},
		rules: {
			// 禁止非空断言
			"@typescript-eslint/no-non-null-assertion": "error",

			// 禁止 any
			"@typescript-eslint/no-explicit-any": "error",

			// 强制使用 readonly (警告级别)
			"@typescript-eslint/prefer-readonly": "warn",

			// 函数行数限制
			"max-lines-per-function": [
				"error",
				{
					max: 50,
					skipBlankLines: true,
					skipComments: true,
				},
			],

			// 圈复杂度
			complexity: ["error", 10],

			// 魔术数字
			"no-magic-numbers": [
				"warn",
				{
					ignore: [-1, 0, 1],
					ignoreArrayIndexes: true,
					ignoreDefaultValues: true,
					ignoreEnums: true,
				},
			],

			// 参数个数限制
			"max-params": ["warn", 4],

			// 嵌套层数限制
			"max-depth": ["warn", 4],

			// 禁止 console.log
			"no-console": "warn",

			// 必须返回值
			"consistent-return": "error",
		},
	},
];
```

> 该配置用了顶层 `await import(...)` 动态加载插件/解析器（需要 `"type": "module"`，已在根 package.json 设置）。
> `eslint-plugin-import` 与 `eslint-import-resolver-typescript` 已作为依赖装好，便于后续扩展 import 规则（当前配置未启用）。

### 4.2 验证 ESLint

```bash
pnpm exec eslint . --cache       # 检查
pnpm exec eslint . --cache --fix # 自动修复
```

### 4.3 本地规则 `local/one-component-per-file` — 一个文件一个组件

「原子化」的另一半：Biome 与 ESLint 内置规则管得了单个函数有多长，管不了**一个文件对外暴露几个组件**。这一条由一个写在仓库里的本地 ESLint 规则（`eslint-rules/one-component-per-file.js`）补上——不是新开一个 `scripts/check-*.js`，因为它需要 AST，而 ESLint 已经把 AST 端到端准备好了。

#### 口径（方案 C）

- **对外组件** = 被 `export` 的 React 组件；
- **私有辅助组件** = 同文件里未导出的 React 组件；
- 违规 = 导出组件数 > 1，**或** 私有辅助组件数 > 2；
- 外加一条命名：文件名必须等于那唯一一个对外组件名的 kebab-case（`case-table.tsx` 里就该是 `CaseTable`）。

#### 为什么是「私有辅助 ≤ 2」而不是严格「一个组件一个文件」

§4.1 那条 `max-lines-per-function: 50` 与「严格一个组件一个文件」是**互相拉扯**的：主组件一超 50 行就必须把一段 JSX 抽成函数组件，而抽出来的那个东西没有任何对外契约，只服务于同文件的主组件。两条规则同时按最严格口径执行，等于「每超 50 行就建一个文件」，此后每改一次 UI 都伴随建文件。

在 `apps/web` 当前代码上实测（AST 统计，不是正则扫；2026-08-31 快照）：非豁免的 `.tsx` 共 208 个，其中 206 个含至少一个组件，组件总数 496（对外 219 + 私有 277）。

| 口径 | 违规文件数 | 需新增文件数 | 组件文件总数变化 |
| --- | --- | --- | --- |
| 严格：一个文件一个组件 | 138 / 206 | +290 | 206 → 496 |
| 方案 C：1 个对外 + ≤2 个私有 | 65 / 206 | +98 | 206 → 304 |

两栏之差的那 **73** 个文件，就是「主组件 + 1~2 个为了 50 行上限切出来的私有片段」这一类。它们在严格口径下要被拆成独立文件，而拆完之后那些文件对外一个 `export` 都不会多。

结论：这条规则要管的是**对外 API 的原子性**，不是文件个数。一个文件对外只暴露一个组件，`import` 的人就永远只有一种写法；文件内部为 50 行上限切出的碎片留在原地反而更好读。上限取 2 而不是 1 或 3：取 1 等价于严格口径；取 3 以上就压不住了——需要新建的文件里有相当一部分来自「一个文件里挤了 4~5 个私有组件」的那些文件。

#### 为什么不用 `eslint-plugin-react` 的 `react/no-multi-comp`

两个原因，任意一个都足以否掉它：

1. **它没有「私有辅助 ≤ N」这一档。** `ignoreStateless: false` 的语义是「文件里出现第二个组件就报错」——那正是上表的严格口径，会把方案 C 下合规的 **73** 个文件（1 个对外 + 1~2 个私有）全判成 error。`ignoreStateless: true` 又走向另一个极端：函数组件一概不管，本仓全是函数组件，等于规则整个失效。中间那一档它不提供。
2. **要为它新增一个 npm 依赖。** 本仓 `scripts/check-package-json.js` 要求所有依赖锁定精确版本（见 §7.2），多一个插件就多一处版本维护面，而它唯一相关的那条规则本来就用不上。

写一条本地规则的成本反而更低：flat config 支持内联 plugin，规则实现就是仓库里的一个 `.js` 文件，口径可以精确对上本仓的取舍，豁免也能被单元测试覆盖。

#### 「什么算一个 React 组件」——判定走 AST，不用正则

拿正则扫源码的结果是 `EMAIL_ID`、`STATUS_FILTER_OPTIONS` 这类 ALL_CAPS 常量被当成组件，而 `memo(function Foo(){})` 这类包装反而扫不出来。判定分两步，**两步都成立**才算组件：

1. **名字像组件**：PascalCase —— 首字母大写**且**含小写字母。「含小写字母」这一条专门排掉 SCREAMING_SNAKE_CASE 常量与 `API` / `URL` 这类纯大写缩写。
2. **函数体像组件**：函数的所有 `return` 值都是 JSX 或空值（`null` / `undefined` / 裸 `return`），且其中至少有一个真的是 JSX。「至少一个 JSX」排掉 `const Foo = () => null` 的空壳；「所有 return 都是 JSX 或空值」排掉 PascalCase 命名的工厂函数（如 `const CaseColumns = () => ({...})`）。

覆盖到的 AST 形态：

| 写法 | AST 上怎么认 |
| --- | --- |
| `function Foo() { return <div/>; }` | `FunctionDeclaration` + `ReturnStatement` 的实参分类 |
| `const Foo = () => <div/>;` | `VariableDeclarator` → `ArrowFunctionExpression`（表达式体直接分类） |
| `const Foo = memo(...)` / `forwardRef(...)` / `React.memo(...)` | `CallExpression` 逐层剥到里面的函数，支持嵌套包装 |
| `export default () => <div/>;` | 匿名默认导出：只计数，不参与命名检查 |
| `export { Foo }` | `ExportNamedDeclaration` 的 specifier，回填到 `Foo` 的声明上 |
| `cond ? <A/> : null`、`cond && <A/>`、`a ?? <B/>` | 逐个分支分类，只要没有「既非 JSX 也非空值」的分支就算 |
| `foo as Bar`、`foo!` | `TSAsExpression` / `TSNonNullExpression` 先剥掉再判 |

刻意保守的地方（宁可漏判，不可误判）：`return content;`（先算好再返回一个标识符）判不出来，会漏掉这个组件；class 组件不判（本仓全是函数组件）；**定义在另一个函数体内部的组件不算文件级组件**——它构不成对外契约，只看顶层声明。

#### 豁免

豁免写在规则实现里（`isExemptFile()`），与 `scripts/check-file-rules.js`、`scripts/check-tailwind.js` 把豁免写进脚本本体的做法一致，这样豁免本身也能被单元测试覆盖。

- **`packages/ui/src/components/`（整文件豁免）** —— vendored 的 shadcn 组件原件。复合组件（`Card` / `CardHeader` / `CardTitle` …）就是它的**既定对外 API**，`table.tsx`、`dropdown-menu.tsx` 单文件导出 8~21 个组件。本仓已对该目录豁免 300 行门禁（`scripts/vendored-ui.js`），这里是同一条理由的延续：判定标准应当是「与 registry 一致」，改了就再也 `shadcn add <name> --diff` 不出来。规则直接复用 `isVendoredUiComponent()`，不另写一份路径判断。
- **`*.test.tsx` / `*.spec.tsx`（整文件豁免）** —— 一个 spec 里为断言临时搭几个小组件是正常写法，与「对外 API 原子化」无关。
- **生成物（整文件豁免）** —— 逐条列出完整路径（当前只有 `apps/web/src/routeTree.gen.ts`），不用 `*.gen.ts` 之类的后缀通配：豁免的依据是「这个文件由插件整体覆盖」，不是它的名字。与 §7.1 的 `GENERATED_FILES` 同一条理由。
- **`/routes/` 下的文件（只豁免命名这一条）** —— file router 的文件名（`__root.tsx`、`$projectId.tsx`、`items.$id.tsx`）由框架强制约定，改不动；两条计数规则仍然适用。与 §7.1 跳过 `/routes/` 命名检查一致。
- **`index.tsx`（只豁免命名这一条）** —— 入口/聚合位，文件名与组件名天然对不上；计数照常。

#### 接入 `eslint.config.js`

flat config 支持内联 plugin，不需要发包，也不需要新增依赖：

```js
	{
		files: ["**/*.tsx"],
		plugins: {
			local: {
				rules: {
					"one-component-per-file": (
						await import("./eslint-rules/one-component-per-file.js")
					).oneComponentPerFile,
				},
			},
		},
		rules: {
			// ⚠️ 存量违规拆完之前是 warn；清零后改成 "error"。
			"local/one-component-per-file": "warn",
		},
	},
```

**为什么先接成 `warn`**：接上时全仓 79 个文件违规、116 条告警（27 条多导出 + 71 条私有超额 + 18 条命名不匹配）。直接上 `error` 会当场卡死所有人的 pre-commit（`lefthook.yml` 的 `eslint-rules` job）与 CI 的 eslint 步骤。门禁的价值是「不让新的违规进来」，存量拆分是另一件事：先 warn 让规则跑起来、把清单曝出来，拆完再升 `error`。**这一步不能忘——长期停在 warn 的规则等于没有门禁。**

命名那一条报出来的 18 处不一定都靠改文件名解决：`run-attachment-gallery.tsx` 里是 `AttachmentGallery`，改组件名去贴文件名同样成立。规则只负责指出「两边对不上」，改哪一边由拆分时定。

#### 规则自身的测试

规则实现放 `eslint-rules/`，配套 `eslint-rules/one-component-per-file.test.mjs`，用 ESLint 自带的 `RuleTester` + `node:test`（与 §7.3 旁边的 `scripts/check-tailwind.test.mjs` 同一路数——门禁本身也是代码，也要有测试）：

```bash
node --test eslint-rules/one-component-per-file.test.mjs
```

必须覆盖的用例：单组件文件通过、1 导出 + 2 私有通过、1 导出 + 3 私有报错、2 导出报错、`export { A, B }` 形式的多导出报错、文件名不匹配报错、vendored 区豁免、测试文件豁免、路由文件跳过命名检查、`index.tsx` 跳过命名检查、ALL_CAPS 常量不被误判、不返回 JSX 的 PascalCase 函数不被误判、`memo()` / `forwardRef()` 包装能被识别、嵌套在组件内部的组件不计入文件级数量。

---

## 5. 配置 TypeScript（类型检查 / pre-push 用）

### 5.1 共享基础配置 `packages/config/tsconfig.base.json`

先建包：

```bash
mkdir -p packages/config
```

`packages/config/package.json`：

```json
{
  "name": "@justsayai-finances/config",
  "version": "0.0.0",
  "private": true
}
```

`packages/config/tsconfig.base.json`：

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "verbatimModuleSyntax": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["node"]
  }
}
```

### 5.2 根 `tsconfig.json`

```json
{
  "extends": "@justsayai-finances/config/tsconfig.base.json",
  "compilerOptions": {
    "strictNullChecks": true
  }
}
```

> 各子包（`apps/*`、`packages/*`）应各自有 `tsconfig.json` 继承 base，并提供 `check-types` 脚本（如 `"check-types": "tsc --noEmit"`），供 turbo 编排。

---

## 6. 配置 Turbo（任务编排）

根目录 `turbo.json`：

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": ["dist/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "check-types": {
      "dependsOn": ["^check-types"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

> `pnpm check-types` → `turbo check-types`，会在各包并行跑 `tsc`。pre-push 钩子调用它（见第 8 步）。

---

## 7. 编写自定义 Node 检查脚本

在根目录建 `scripts/` 目录，放 3 个脚本。它们接收暂存文件路径作为参数（由 lefthook 传入），发现违规则 `exit 1`。

```bash
mkdir -p scripts
```

### 7.1 `scripts/check-file-rules.js` — 文件命名 + 行数

规则：
- 所有文件统一 kebab-case（`user-profile.ts`），**包括 `.tsx` 组件文件**（如 `alert-dialog.tsx`）。
- 允许 `.test` / `.spec` / `.config` 后缀（如 `foo.test.ts`、`vite.config.ts`），主名部分仍须为 kebab-case。
- 约定俗成的例外文件名（`index`、`page`、`layout` 等）跳过命名检查。
- file router 路由目录（路径含 `/routes/`）的文件命名由框架约定（如 `__root.tsx`、`$projectId.tsx`），跳过命名检查，行数检查仍适用。
- 任何文件**不超过 300 行**。

```js
#!/usr/bin/env node

/**
 * 自定义代码规则检查
 * - 文件命名: 统一 kebab-case（含 .tsx 组件文件）
 *   - 允许 .test / .spec / .config 后缀（如 foo.test.ts、vite.config.ts），
 *     主名部分仍须为 kebab-case
 * - 文件行数: 不超过 300 行
 *
 * 本仓库偏差说明:
 * - apps/web 使用 TanStack Start file router，`src/routes/` 下的文件名
 *   （如 __root.tsx、$projectId.tsx、items.$id.tsx）是框架强制约定，
 *   无法满足 kebab-case 规则。因此路径中含 `/routes/` 的文件
 *   跳过命名检查（行数检查仍然适用）。
 */

import { readFileSync } from "node:fs";

const MAX_LINES = 300;

// 常见例外文件名（约定俗成，无需检查命名）
const EXCEPTIONS = [
	"index",
	"_app",
	"_document",
	"_error",
	"layout",
	"loading",
	"error",
	"page",
	"template",
	"not-found",
	"route",
	"routes",
	"server",
	"client",
	"main",
	"app",
	"root",
];

// kebab-case 正则
const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*(\.(test|spec|config))?(\.[a-z]+)?$/;

// 文件扩展名正则（顶层定义，避免循环内创建）
const FILE_EXT_PATTERN = /\.(tsx?|jsx?)$/;

function checkFileName(filePath) {
	// TanStack Start file router 路由文件命名由框架约定，跳过命名检查
	if (filePath.includes("/routes/")) {
		return { valid: true };
	}

	const fileName = filePath.split("/").pop();
	const baseName = fileName.replace(FILE_EXT_PATTERN, "");

	// 检查例外文件名
	if (EXCEPTIONS.includes(baseName)) {
		return { valid: true };
	}

	// 所有文件统一使用 kebab-case
	if (KEBAB_CASE.test(fileName)) {
		return { valid: true };
	}

	return {
		error: "文件名应使用 kebab-case，如: user-profile.ts",
		valid: false,
	};
}

function checkFileLines(content) {
	const lines = content.split("\n").length;

	if (lines > MAX_LINES) {
		return {
			error: `文件超过 ${MAX_LINES} 行 (当前: ${lines} 行)`,
			valid: false,
		};
	}

	return { valid: true };
}

function main() {
	const files = process.argv.slice(2);

	if (files.length === 0) {
		console.log("没有文件需要检查");
		process.exit(0);
	}

	let hasErrors = false;

	for (const file of files) {
		try {
			// 检查文件命名
			const nameCheck = checkFileName(file);
			if (!nameCheck.valid) {
				console.error(`\n❌ ${file}`);
				console.error(`   ${nameCheck.error}`);
				hasErrors = true;
			}

			// 检查文件行数
			const content = readFileSync(file, "utf-8");
			const linesCheck = checkFileLines(content);
			if (!linesCheck.valid) {
				console.error(`\n❌ ${file}`);
				console.error(`   ${linesCheck.error}`);
				hasErrors = true;
			}
		} catch {
			// 忽略无法读取的文件
		}
	}

	if (hasErrors) {
		console.error("\n❌ 文件规则检查失败");
		process.exit(1);
	}

	console.log("✅ 文件规则检查通过");
	process.exit(0);
}

main();
```

### 7.2 `scripts/check-package-json.js` — 依赖版本固定

规则：`dependencies` / `devDependencies` / `peerDependencies` 中**禁止** `^`、`~`、`latest`、`*`、`>` `<` `=` 范围，必须固定版本号；`workspace:*` 和 `catalog:*` 例外。

```js
#!/usr/bin/env node

/**
 * 检查 package.json 依赖版本规则
 * - 禁止使用 ^ 前缀（必须使用固定版本）
 * - 禁止使用 ~ 前缀
 * - 禁止使用 "latest"
 * - workspace 和 catalog 除外
 */

import { readFileSync } from "node:fs";

const ALLOWED_PATTERNS = [
	/^workspace:\*$/, // workspace protocol
	/^catalog:\*$/, // catalog protocol
	/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/, // 固定版本号
	/^file:/, // local file
	/^link:/, // link
];

function checkDependencyVersions(obj, path = []) {
	const issues = [];

	for (const [key, value] of Object.entries(obj)) {
		const currentPath = [...path, key];

		if (typeof value === "object" && value !== null) {
			// 递归检查嵌套对象
			issues.push(...checkDependencyVersions(value, currentPath));
		} else if (typeof value === "string") {
			// 检查版本字符串
			const section = currentPath[0];

			if (
				(section === "dependencies" ||
					section === "devDependencies" ||
					section === "peerDependencies") &&
				(value.startsWith("^") ||
					value.startsWith("~") ||
					value === "latest" ||
					value === "*" ||
					value.startsWith(">") ||
					value.startsWith("<") ||
					value.startsWith("="))
			) {
				issues.push({
					dependency: key,
					version: value,
					reason: getVersionErrorReason(value),
				});
			}
		}
	}

	return issues;
}

function getVersionErrorReason(version) {
	if (version.startsWith("^")) {
		return "使用 ^ 前缀";
	}
	if (version.startsWith("~")) {
		return "使用 ~ 前缀";
	}
	if (version === "latest") {
		return "使用 latest";
	}
	if (version === "*") {
		return "使用 *";
	}
	if (
		version.startsWith(">") ||
		version.startsWith("<") ||
		version.startsWith("=")
	) {
		return "使用范围版本";
	}
	return "版本格式不正确";
}

function checkPackageJson(filePath) {
	try {
		const content = readFileSync(filePath, "utf-8");
		const pkg = JSON.parse(content);

		const issues = checkDependencyVersions(pkg);

		if (issues.length > 0) {
			console.error(`\n❌ ${filePath}`);
			console.error(`   发现 ${issues.length} 个依赖版本不符合规范:\n`);

			issues.forEach((issue) => {
				console.error(
					`   - ${issue.dependency}: "${issue.version}" (${issue.reason})`
				);
			});

			console.error('\n   正确格式: 使用固定版本号，如 "1.2.3"');
			console.error("   例外: workspace:* 和 catalog:* 可以使用\n");

			return false;
		}

		return true;
	} catch (error) {
		console.error(`检查 ${filePath} 失败: ${error.message}`);
		return false;
	}
}

function main() {
	const files = process.argv.slice(2);

	if (files.length === 0) {
		// 默认检查根目录的 package.json
		console.log("没有指定文件，检查根目录 package.json");
		process.exit(0);
	}

	let allValid = true;

	for (const file of files) {
		if (!file.endsWith("package.json")) {
			continue;
		}

		const isValid = checkPackageJson(file);
		if (!isValid) {
			allValid = false;
		}
	}

	if (!allValid) {
		console.error("\n❌ package.json 检查失败");
		console.error("\n请将依赖版本改为固定版本号:");
		console.error('  "^1.2.3"  →  "1.2.3"');
		console.error('  "latest"   →  "2.1.9"\n');
		process.exit(1);
	}

	console.log("✅ package.json 检查通过");
	process.exit(0);
}

main();
```

### 7.3 `scripts/check-tailwind.js` — 禁止 Tailwind 任意值

规则：禁止 `w-[96px]`、`bg-[#fff]` 这类任意值语法；`group-`、`peer-`、`variant-` 变体除外。

```js
#!/usr/bin/env node

/**
 * 检查 Tailwind CSS 任意值使用
 * - 禁止使用任意值语法，如 w-[96px]、h-[50%]、bg-[#fff]
 * - 只允许使用标准的 Tailwind 类名
 */

import { readFileSync } from "node:fs";

// 任意值正则：匹配 [xxx] 格式
const ARBITRARY_VALUE_PATTERN = /\[[^\]]+\]/g;

// 允许的例外（特殊情况）
const ALLOWED_PATTERNS = [
	/variant-/i, // variant() 函数
	/group-/i, // group- 变体
	/peer-/i, // peer- 变体
];

// 检查一行中的类名
function checkLineForArbitraryValues(line, lineNumber) {
	const issues = [];

	// 查找所有可能的类名位置
	// 匹配 className=, class:, tw` 等模式
	const classNamePatterns = [
		/(?:className|class)\s*=\s*[{("']([^{}()"'']*)[})"']/g,
		/tw`([^`]*)`/g,
		/cn\(([^)]*)\)/g,
		/clsx\(([^)]*)\)/g,
		/cva\(([^)]*)\)/g,
	];

	for (const pattern of classNamePatterns) {
		let match;
		while ((match = pattern.exec(line)) !== null) {
			const classNames = match[1];

			// 查找任意值
			const arbitraryMatches = [
				...classNames.matchAll(ARBITRARY_VALUE_PATTERN),
			];

			for (const arbitraryMatch of arbitraryMatches) {
				const value = arbitraryMatch[0];

				// 检查是否是允许的例外
				const isAllowed = ALLOWED_PATTERNS.some((p) => p.test(value));

				if (!isAllowed) {
					issues.push({
						line: lineNumber,
						value,
						context: line.trim().substring(0, 60),
					});
				}
			}
		}
	}

	return issues;
}

// 检查文件
function checkFile(filePath) {
	try {
		const content = readFileSync(filePath, "utf-8");
		const lines = content.split("\n");
		const issues = [];

		lines.forEach((line, index) => {
			const lineIssues = checkLineForArbitraryValues(line, index + 1);
			issues.push(...lineIssues);
		});

		return issues;
	} catch (error) {
		return [];
	}
}

function main() {
	const files = process.argv.slice(2);

	if (files.length === 0) {
		console.log("没有文件需要检查");
		process.exit(0);
	}

	let hasErrors = false;

	for (const file of files) {
		// 只检查 TSX/TS/JSX/JS 文件
		if (
			!(
				file.endsWith(".tsx") ||
				file.endsWith(".ts") ||
				file.endsWith(".jsx") ||
				file.endsWith(".js")
			)
		) {
			continue;
		}

		const issues = checkFile(file);

		if (issues.length > 0) {
			console.error(`\n❌ ${file}`);
			console.error(`   发现 ${issues.length} 处 Tailwind 任意值使用:\n`);

			issues.forEach((issue) => {
				console.error(`   第 ${issue.line} 行: ${issue.value}`);
				console.error(`   上下文: ${issue.context}...`);
			});

			hasErrors = true;
		}
	}

	if (hasErrors) {
		console.error("\n❌ Tailwind CSS 检查失败");
		console.error("\n请使用标准 Tailwind 类名:");
		console.error('  "w-[96px]"    →  "w-24"');
		console.error('  "h-[50%]"     →  "h-1/2"');
		console.error('  "bg-[#fff]"   →  "bg-white"');
		console.error('  "p-[1.5rem]"  →  "p-6"');
		console.error("\n如果必须使用自定义值，请在 tailwind.config.js 中定义:\n");
		console.error("  module.exports = {");
		console.error("    theme: {");
		console.error("      extend: {");
		console.error("        width: { '96': '24rem' }");
		console.error("      }");
		console.error("    }");
		console.error("  }\n");
		process.exit(1);
	}

	console.log("✅ Tailwind CSS 检查通过");
	process.exit(0);
}

main();
```

> 三个脚本之外还有一条**写在 ESLint 里**的仓库自有规则：`local/one-component-per-file`（一个文件一个对外组件 + ≤2 个私有辅助组件）。它需要 AST 判定「什么算 React 组件」，用正则扫源码会把 `EMAIL_ID` 这类 ALL_CAPS 常量误判成组件，所以没有做成第 4 个 `scripts/check-*.js`，而是作为本地 ESLint 规则接在 flat config 里。见 §4.3。

---

## 8. 配置 Lefthook（Git 钩子核心）

### 8.1 在根目录创建 `lefthook.yml`

```yaml
# Lefthook configuration
# https://github.com/evilmartians/lefthook

pre-commit:
  parallel: true
  jobs:
    - name: ultracite-format
      glob: "*.{js,ts,cjs,mjs,d.cts,d.mts,jsx,tsx,json,jsonc}"
      run: pnpm dlx ultracite fix --files-ignore-unknown=true {staged_files}
      stage_fixed: true

    - name: ultracite-lint
      glob: "*.{js,ts,cjs,mjs,d.cts,d.mts,jsx,tsx,json,jsonc}"
      run: pnpm dlx ultracite check --files-ignore-unknown=true {staged_files}

    - name: file-rules
      glob: "*.{js,ts,cjs,mjs,d.cts,d.mts,jsx,tsx}"
      run: node scripts/check-file-rules.js {staged_files}

    - name: eslint-rules
      glob: "*.{js,ts,cjs,mjs,jsx,tsx}"
      run: pnpm eslint --no-cache {staged_files}

    - name: package-json-rules
      glob: "package.json"
      run: node scripts/check-package-json.js {staged_files}

    - name: tailwind-rules
      glob: "*.{tsx,ts,jsx,js}"
      run: node scripts/check-tailwind.js {staged_files}

commit-msg:
  piped: true
  commands:
    conventional-commits:
      run: |
        msg=$(cat {1})
        # Conventional Commits pattern: type(scope): description
        # Types: feat, fix, docs, style, refactor, perf, test, chore, revert, ci, build
        pattern="^(feat|fix|docs|style|refactor|perf|test|chore|revert|ci|build)(\(.+\))?: .{1,72}"
        if echo "$msg" | grep -qE "$pattern"; then
          exit 0
        fi
        echo "❌ 提交信息格式不符合 Conventional Commits 规范"
        echo ""
        echo "正确格式: type(scope): description"
        echo ""
        echo "类型 (type):"
        echo "  feat     - 新功能"
        echo "  fix      - 修复 bug"
        echo "  docs     - 文档变更"
        echo "  style    - 代码格式调整"
        echo "  refactor - 重构"
        echo "  perf     - 性能优化"
        echo "  test     - 测试"
        echo "  chore    - 构建/工具"
        echo "  revert   - 回退"
        echo "  ci       - CI 配置"
        echo "  build    - 构建"
        echo ""
        echo "示例:"
        echo "  feat(auth): 添加用户登录功能"
        echo "  fix: 修复导航栏样式问题"
        echo "  docs(api): 更新 API 文档"
        exit 1

pre-push:
  parallel: true
  commands:
    type-check:
      run: pnpm check-types
```

### 8.2 三个阶段的逻辑

**pre-commit（并行，只对暂存文件）：**
1. `ultracite-format`：Biome 自动格式化 → `stage_fixed: true` 把修复结果重新加入暂存区。
2. `ultracite-lint`：Biome lint 校验，有 error 则中止提交。
3. `file-rules`：跑 `check-file-rules.js`（命名 + 行数）。
4. `eslint-rules`：对暂存文件跑 ESLint（`--no-cache`，确保即时结果）。
5. `package-json-rules`：跑 `check-package-json.js`（版本固定）。
6. `tailwind-rules`：跑 `check-tailwind.js`（禁任意值）。

**commit-msg（管道模式）：** 用正则强制 Conventional Commits 格式 `type(scope): description`，描述长度 1–72 字符，type 限定 11 种；不符合则打印中文帮助并 `exit 1`。

**pre-push（并行）：** 跑 `pnpm check-types`（turbo → 各包 tsc），类型不过不允许推送。

### 8.3 安装 Git 钩子（关键，容易遗漏）

`lefthook.yml` 只是配置，必须**安装**才能在 `.git/hooks/` 生成真正的钩子：

```bash
pnpm exec lefthook install
```

成功后会生成 `.git/hooks/pre-commit`、`.git/hooks/commit-msg`、`.git/hooks/pre-push`。

> 验证：`ls .git/hooks/ | grep -E 'pre-commit|commit-msg|pre-push'` 应能看到三个文件。
> 团队协作建议：在根 `package.json` 增加 `"prepare": "lefthook install"`，这样他人 `pnpm install` 后会自动安装钩子（本项目当前是手动安装）。

---

## 9. `.gitignore`

```gitignore
# Dependencies
node_modules
.pnp
.pnp.js

# Build outputs
dist
build
*.tsbuildinfo

# Environment variables
.env
.env*.local

# IDEs and editors
.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
.idea
*.swp
*.swo
*~
.DS_Store

# Logs
logs
*.log

# Turbo
.turbo
.nx

# Testing
coverage
.nyc_output

# Misc
*.tgz
.cache
tmp
temp
```

---

## 10. 端到端验证（务必逐项确认）

按以下步骤确认搭建出的检查效果与本项目一致：

```bash
# 10.1 引擎可用
pnpm exec biome --version          # 期望 2.4.15
pnpm exec ultracite doctor         # 无冲突
pnpm exec eslint --version         # 期望 v10.4.1
pnpm exec lefthook version         # 期望 2.1.9

# 10.2 手动跑各检查
pnpm check                         # ultracite check 全量
pnpm lint                          # eslint 全量
pnpm check-types                   # 全量类型检查
node scripts/check-file-rules.js  some/File.ts
node scripts/check-package-json.js package.json
node scripts/check-tailwind.js    some/Component.tsx
```

### 10.3 钩子行为验证（核心）

| 场景 | 操作 | 期望结果 |
| --- | --- | --- |
| 格式化自动修复 | 提交一个缩进乱的 `.ts` | 自动 tab 格式化并重新入暂存，提交成功 |
| lint 拦截 | 提交含 `any` 的 `.ts` | `ultracite-lint` 报错，提交被拒 |
| 文件行数 | 提交 >300 行文件 | `file-rules` 报错，提交被拒 |
| 文件命名 | 提交 `myComponent.ts`（应 kebab） | `file-rules` 报错 |
| 依赖版本 | `package.json` 写 `"foo": "^1.0.0"` | `package-json-rules` 报错 |
| Tailwind | 写 `className="w-[96px]"` | `tailwind-rules` 报错 |
| commit-msg | `git commit -m "随便写"` | 被拒，打印 Conventional Commits 帮助 |
| commit-msg 通过 | `git commit -m "feat: 添加功能"` | 通过 |
| pre-push 类型 | 推送含类型错误的代码 | `type-check` 失败，推送被拒 |

---

## 附录 A：代码规则清单（务必标记）

> 这是所有**被强制检查**的规则汇总。按工具来源分类，标注严重级别（error 阻断 / warn 提示 / info 信息）。

### A.1 Biome / Ultracite 规则（来自 `biome.json`，在 `ultracite/biome/core` + `react` 预设之上）

**格式（formatter）**
- 缩进：**tab**。
- JS/TS 字符串：**双引号**（`quoteStyle: double`）。
- 自动整理 import（`organizeImports: on`）。
- Tailwind 类名排序 `useSortedClasses`（识别 `clsx`/`cva`/`cn`）— **warn**，安全自动修复。
- CSS 支持 Tailwind 指令解析。

**correctness（正确性）**
- `noUnusedImports` — **error**（禁止未使用 import）。
- `noUnusedVariables` — **error**（禁止未使用变量）。
- `useExhaustiveDependencies` — **info**（React hook 依赖完整性）。

**style（风格）— 全部 error**
- `noParameterAssign`（禁止给参数赋值）
- `useAsConstAssertion`（用 `as const`）
- `useDefaultParameterLast`（默认参数放最后）
- `useEnumInitializers`（枚举需初始化值）
- `useSelfClosingElements`（空元素自闭合）
- `useSingleVarDeclarator`（每个声明一个变量）
- `noUnusedTemplateLiteral`（无变量时不用模板字符串）
- `useNumberNamespace`（用 `Number.xxx`）
- `noInferrableTypes`（禁止冗余可推断类型注解）
- `noUselessElse`（禁止无用 else）
- `useNodejsImportProtocol`（Node 内置模块用 `node:` 前缀）

**suspicious（可疑）**
- `noExplicitAny` — **error**（禁止 `any`；`.ts/.tsx` override 再次强制）
- `noArrayIndexKey` — **error**（禁止用数组下标当 React key）
- `noDebugger` — **error**（禁止 `debugger`）
- `noConsole` — **warn**（提示 `console`）

**complexity（复杂度）**
- `noStaticOnlyClass` — **error**
- `useLiteralKeys` — **error**
- `noUselessSwitchCase` — **error**
- `noUselessTernary` — **error**
- `noBannedTypes` — **error**
- `noForEach` — **warn**（推荐 `for...of`）

**performance（性能）**
- `noAccumulatingSpread` — **error**（禁止在循环累加器里用展开）
- `noBarrelFile` — **warn**（不鼓励 barrel/index 重导出）

> 另含 `recommended: true` 启用的 Biome 推荐规则全集 + Ultracite 预设的全部严格规则。

### A.2 ESLint 规则（来自 `eslint.config.js`，仅 `**/*.ts`、`**/*.tsx`）

- `@typescript-eslint/no-non-null-assertion` — **error**（禁止 `!` 非空断言）
- `@typescript-eslint/no-explicit-any` — **error**（禁止 `any`）
- `@typescript-eslint/prefer-readonly` — **warn**（建议 `readonly`）
- `max-lines-per-function` — **error**，单函数 ≤ **50 行**（不计空行/注释）
- `complexity` — **error**，圈复杂度 ≤ **10**
- `no-magic-numbers` — **warn**（忽略 -1/0/1、数组下标、默认值、枚举）
- `max-params` — **warn**，参数 ≤ **4**
- `max-depth` — **warn**，嵌套 ≤ **4** 层
- `no-console` — **warn**
- `consistent-return` — **error**（返回值一致）
- `local/one-component-per-file` — **warn**（本地规则，仅 `**/*.tsx`）：1 个对外组件 + ≤ **2** 个私有辅助组件，且文件名须为对外组件名的 kebab-case。存量拆分完成后升为 **error**。口径与豁免见 §4.3

### A.3 自定义脚本规则（`scripts/*.js`，pre-commit 执行）

**文件规则（`check-file-rules.js`）— error 阻断**
- 所有文件（含 `.tsx` 组件）统一 kebab-case；允许 `.test` / `.spec` / `.config` 后缀（主名仍须 kebab-case）。
- 例外名单跳过命名检查：`index, _app, _document, _error, layout, loading, error, page, template, not-found, route, routes, server, client, main, app, root`。
- file router 路由目录（路径含 `/routes/`）文件命名由框架约定，跳过命名检查（行数检查仍适用）。
- 任何文件 ≤ **300 行**。

**package.json 版本规则（`check-package-json.js`）— error 阻断**
- `dependencies` / `devDependencies` / `peerDependencies` 必须固定版本号（`x.y.z`）。
- 禁止 `^`、`~`、`latest`、`*`、`>`/`<`/`=` 范围。
- 例外：`workspace:*`、`catalog:*`、`file:`、`link:`。

**Tailwind 规则（`check-tailwind.js`）— error 阻断**
- 禁止任意值语法 `[...]`（如 `w-[96px]`、`bg-[#fff]`、`p-[1.5rem]`）。
- 检测位置：`className=`/`class=`、`` tw`` ``、`cn(...)`、`clsx(...)`、`cva(...)`。
- 例外：含 `group-`、`peer-`、`variant-` 的类。

### A.4 提交信息规则（`lefthook.yml` commit-msg）— error 阻断

- 必须符合 Conventional Commits：`type(scope): description`。
- `type` ∈ `{feat, fix, docs, style, refactor, perf, test, chore, revert, ci, build}`。
- `scope` 可选；`description` 长度 **1–72** 字符。

### A.5 推送前规则（`lefthook.yml` pre-push）— error 阻断

- `pnpm check-types`（全仓库 `tsc --noEmit`）必须通过。
- TypeScript 严格选项（`packages/config/tsconfig.base.json`）：`strict`、`noUncheckedIndexedAccess`、`noUnusedLocals`、`noUnusedParameters`、`noFallthroughCasesInSwitch`、`verbatimModuleSyntax`、`isolatedModules`、`forceConsistentCasingInFileNames` + 根 `tsconfig.json` 的 `strictNullChecks`。

---

## 附录 B：最小执行清单（给执行 agent）

```bash
git init
corepack enable && corepack prepare pnpm@10.22.0 --activate
# 1. 写入：pnpm-workspace.yaml, package.json, biome.json, eslint.config.js,
#    turbo.json, tsconfig.json, lefthook.yml, .gitignore
# 2. 写入：packages/config/{package.json,tsconfig.base.json}
# 3. 写入：scripts/{check-file-rules.js,check-package-json.js,check-tailwind.js}
pnpm install
pnpm exec lefthook install        # ← 安装 git 钩子，绝不能漏
# 验证
pnpm exec ultracite doctor
pnpm check && pnpm lint && pnpm check-types
ls .git/hooks/ | grep -E 'pre-commit|commit-msg|pre-push'
```

完成以上即可得到与本项目完全一致的检查效果。
```
