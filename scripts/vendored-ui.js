import { resolve } from "node:path";

const VENDORED_UI_COMPONENTS_DIR = "packages/ui/src/components/";

export function isVendoredUiComponent(filePath) {
	const absolute = resolve(filePath).replaceAll("\\", "/");
	return absolute.includes(`/${VENDORED_UI_COMPONENTS_DIR}`);
}

export function selectCheckableFiles(files, extensionPattern) {
	return files.filter(
		(file) => extensionPattern.test(file) && !isVendoredUiComponent(file)
	);
}

export const VENDORED_UI_HINT =
	"packages/ui/src/components/ 是 shadcn vendored 区，本规则对它豁免。";
