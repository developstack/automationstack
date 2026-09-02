/**
 * 新建目录行：browser + version + image，外加「设为默认」。
 *
 * 不放「启用」：新加的一行当然是启用的（加一行却默认关着，等于白加），
 * 想先占位再打开是极少数情况，加完再到行内编辑里关掉即可。
 */
import { Button } from "@automationstack/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";
import { type FormEvent, useCallback, useState } from "react";

import { FarmFormError } from "@/components/farm/farm-form-error";
import { FarmBrowserField } from "@/components/farm-browsers/farm-browser-field";
import {
	BROWSER_HINT,
	DEFAULT_FLAG_DESCRIPTION,
	DEFAULT_FLAG_LABEL,
	IMAGE_HINT,
	VERSION_HINT,
	validateBrowserName,
	validateImage,
	validateVersion,
} from "@/components/farm-browsers/farm-browser-meta";
import { FarmBrowserToggleField } from "@/components/farm-browsers/farm-browser-toggle-field";
import { useCreateFarmBrowser } from "@/components/farm-browsers/use-farm-browser-mutations";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

/**
 * 表单状态与校验。
 * `submitted` 决定「还没动过的空字段」要不要报错：一进对话框就把三个字段
 * 标红等于劈头指责，所以空值只在提交过一次之后才算错（与新建用户表单同规）。
 */
function useCreateBrowserForm(onClose: () => void) {
	const create = useCreateFarmBrowser(onClose);
	const [browser, setBrowser] = useState("");
	const [image, setImage] = useState("");
	const [isDefault, setIsDefault] = useState(false);
	const [submitted, setSubmitted] = useState(false);
	const [version, setVersion] = useState("");

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			setSubmitted(true);
			const invalid =
				validateBrowserName(browser) !== null ||
				validateVersion(version) !== null ||
				validateImage(image) !== null;
			if (invalid) {
				return;
			}
			// 三个值都 trim 之后再送：校验量的是 trim 后的长度，送原值等于绕过自己的规则
			create.mutate({
				browser: browser.trim(),
				image: image.trim(),
				isDefault,
				version: version.trim(),
			});
		},
		[browser, create, image, isDefault, version]
	);

	const shown = (value: string) => submitted || value !== "";

	return {
		browser,
		browserError: shown(browser) ? validateBrowserName(browser) : null,
		error: create.error?.message,
		handleSubmit,
		image,
		imageError: shown(image) ? validateImage(image) : null,
		isDefault,
		pending: create.isPending,
		setBrowser,
		setImage,
		setIsDefault,
		setVersion,
		version,
		versionError: shown(version) ? validateVersion(version) : null,
	};
}

type CreateBrowserForm = ReturnType<typeof useCreateBrowserForm>;

/**
 * 三个标识字段。单独拆出来只为把上面那个表单函数压回 50 行以内（本仓 eslint
 * 的 max-lines-per-function），拆点选在这里是因为这三格恰好是一组：它们合起来
 * 描述「哪个镜像」，而下面的开关描述「怎么用它」。
 */
function BrowserIdentityFields({ form }: { form: CreateBrowserForm }) {
	return (
		<>
			<FarmBrowserField
				error={form.browserError}
				hint={BROWSER_HINT}
				id="farm-browser-name"
				label="浏览器"
				onChange={form.setBrowser}
				value={form.browser}
			/>
			<FarmBrowserField
				error={form.versionError}
				hint={VERSION_HINT}
				id="farm-browser-version"
				label="版本"
				onChange={form.setVersion}
				value={form.version}
			/>
			<FarmBrowserField
				error={form.imageError}
				hint={IMAGE_HINT}
				id="farm-browser-image"
				label="镜像"
				onChange={form.setImage}
				value={form.image}
			/>
		</>
	);
}

function CreateFarmBrowserForm({ onClose }: { onClose: () => void }) {
	const form = useCreateBrowserForm(onClose);

	return (
		// noValidate：原生气泡是英文的，也没法和这里的中文内联提示对齐
		<form
			className="flex flex-col gap-4"
			noValidate={true}
			onSubmit={form.handleSubmit}
		>
			<BrowserIdentityFields form={form} />
			<FarmBrowserToggleField
				checked={form.isDefault}
				description={DEFAULT_FLAG_DESCRIPTION}
				id="farm-browser-default"
				label={DEFAULT_FLAG_LABEL}
				onChange={form.setIsDefault}
			/>
			<FarmFormError message={form.error} />
			<DialogFooter>
				<Button onClick={onClose} type="button" variant="outline">
					取消
				</Button>
				<Button disabled={form.pending} type="submit">
					{form.pending ? "添加中…" : "添加"}
				</Button>
			</DialogFooter>
		</form>
	);
}

export function CreateFarmBrowserDialog({
	onClose,
	open,
}: {
	onClose: () => void;
	open: boolean;
}) {
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>添加镜像</DialogTitle>
					<DialogDescription>
						浏览器名与版本合起来是这一行的标识，脚本按它们请求会话；添加之后这两项就不能再改了。
					</DialogDescription>
				</DialogHeader>
				{/* 只在打开时挂载：关闭后重新打开是一张干净的表，不留上次的输入和错误 */}
				{open ? <CreateFarmBrowserForm onClose={onClose} /> : null}
			</DialogContent>
		</Dialog>
	);
}
