/**
 * vendored 的 shadcn 组件豁免区判定。
 *
 * 本仓库偏差说明:
 * - `packages/ui/src/components/` 放的是从 shadcn registry vendored 下来的
 *   组件原件（`components.json` 把 aliases.ui 指到这里，`shadcn add` 与
 *   `shadcn add <name> --diff` 都落在这个目录）。它们是上游代码，不是本仓库
 *   自己写的业务代码，判定标准应当是「与 registry 一致」而不是本仓库的风格线。
 * - 因此这里放行两条与上游直接冲突的规则:
 *   1. 300 行上限（check-file-rules.js）——上游多个组件本身就超，最典型的是
 *      sidebar，单文件约 700 行；
 *   2. Tailwind 任意值（check-tailwind.js）——上游原件里大量使用
 *      `ring-[3px]`、`h-[18.4px]`、`translate-x-[calc(100%-2px)]` 之类的写法。
 *   为迁就这两条去拆分或改写原件，会让本地文件与 registry 永久对不上：
 *   `shadcn add <name> --diff` 的输出被本地改动淹没、后续也无法再靠 CLI 更新。
 * - 豁免只覆盖 components 目录。`packages/ui/src/lib/`、`src/hooks/`、
 *   `src/styles/` 是本仓库自己维护的，`apps/` 下的业务代码更是，全部照常受管。
 * - 命名检查（kebab-case）不在豁免范围内——shadcn 本来就是 kebab-case，
 *   两者不冲突。
 */

import { resolve } from "node:path";

const VENDORED_UI_COMPONENTS_DIR = "packages/ui/src/components/";

/**
 * 兼容绝对路径与相对路径（含从子目录传入的相对路径，如在 packages/ui 里
 * 执行时的 `src/components/button.tsx`）：先归一成绝对路径，再要求
 * `packages/ui/src/components/` 作为完整路径段出现，避免误放行。
 */
export function isVendoredUiComponent(filePath) {
	const absolute = resolve(filePath).replaceAll("\\", "/");
	return absolute.includes(`/${VENDORED_UI_COMPONENTS_DIR}`);
}

/** 从待检查文件列表里筛掉扩展名不匹配的、以及豁免区里的 vendored 组件。 */
export function selectCheckableFiles(files, extensionPattern) {
	return files.filter(
		(file) => extensionPattern.test(file) && !isVendoredUiComponent(file)
	);
}

/** 检查失败时附在帮助文案末尾的一句：说明哪块地方本来就不受这条规则约束。 */
export const VENDORED_UI_HINT =
	"packages/ui/src/components/ 是 shadcn vendored 区，本规则对它豁免。";
