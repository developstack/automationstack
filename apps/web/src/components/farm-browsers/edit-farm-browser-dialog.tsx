/**
 * 编辑目录行：镜像 + 两个开关。
 *
 * browser 与 version 不在表单里，只出现在标题上：它们合起来是这一行的标识
 * （脚本按它们请求会话），改掉等于换了一行——那种意图应当走「添加 + 删除」，
 * 而不是在编辑框里悄悄改掉一个别人正在用的键。契约里 `update` 的 patch 也只
 * 开放 image / isDefault / enabled 三项，两边是一致的。
 */
import type { UpdateFarmBrowserInput } from "@automationstack/db/repositories/farm-browser-repository";
import type { FarmBrowser } from "@automationstack/db/schema/farm-browsers";
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
	browserDisplayName,
	DEFAULT_FLAG_DESCRIPTION,
	DEFAULT_FLAG_LABEL,
	ENABLED_FLAG_DESCRIPTION,
	ENABLED_FLAG_LABEL,
	IMAGE_HINT,
	validateImage,
} from "@/components/farm-browsers/farm-browser-meta";
import { FarmBrowserToggleField } from "@/components/farm-browsers/farm-browser-toggle-field";
import { useUpdateFarmBrowser } from "@/components/farm-browsers/use-farm-browser-mutations";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

/**
 * 只把**动过的字段**塞进 patch。
 *
 * 这不是省流量：`isDefault` 在服务端是「一张表只有一个真」的字段，原样回传
 * `isDefault: false`（这一行本来就不是默认）会变成一次真实的写入，服务端有没有
 * 把它当成「取消默认」取决于实现——而用户根本没碰那个勾。只送动过的字段，
 * 语义上就没有这个歧义。全都没动时返回 null，调用方直接关框、不发请求。
 */
function buildPatch(
	row: FarmBrowser,
	next: { enabled: boolean; image: string; isDefault: boolean }
): UpdateFarmBrowserInput | null {
	const patch: UpdateFarmBrowserInput = {};
	const image = next.image.trim();
	if (image !== row.image) {
		patch.image = image;
	}
	if (next.isDefault !== row.isDefault) {
		patch.isDefault = next.isDefault;
	}
	if (next.enabled !== row.enabled) {
		patch.enabled = next.enabled;
	}
	return Object.keys(patch).length === 0 ? null : patch;
}

function useEditBrowserForm(row: FarmBrowser, onClose: () => void) {
	const update = useUpdateFarmBrowser(onClose);
	const [enabled, setEnabled] = useState(row.enabled);
	const [image, setImage] = useState(row.image);
	const [isDefault, setIsDefault] = useState(row.isDefault);
	const [submitted, setSubmitted] = useState(false);

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			setSubmitted(true);
			if (validateImage(image) !== null) {
				return;
			}
			const patch = buildPatch(row, { enabled, image, isDefault });
			if (patch === null) {
				// 什么都没改：不发请求，也不弹「已更新」——那句话会是假的
				onClose();
				return;
			}
			update.mutate({ id: row.id, patch });
		},
		[enabled, image, isDefault, onClose, row, update]
	);

	return {
		enabled,
		error: update.error?.message,
		handleSubmit,
		image,
		imageError: submitted || image !== "" ? validateImage(image) : null,
		isDefault,
		pending: update.isPending,
		setEnabled,
		setImage,
		setIsDefault,
	};
}

function EditFarmBrowserForm({
	onClose,
	row,
}: {
	onClose: () => void;
	row: FarmBrowser;
}) {
	const form = useEditBrowserForm(row, onClose);

	return (
		<form
			className="flex flex-col gap-4"
			noValidate={true}
			onSubmit={form.handleSubmit}
		>
			<FarmBrowserField
				error={form.imageError}
				hint={IMAGE_HINT}
				id="farm-browser-edit-image"
				label="镜像"
				onChange={form.setImage}
				value={form.image}
			/>
			<FarmBrowserToggleField
				checked={form.isDefault}
				description={DEFAULT_FLAG_DESCRIPTION}
				id="farm-browser-edit-default"
				label={DEFAULT_FLAG_LABEL}
				onChange={form.setIsDefault}
			/>
			<FarmBrowserToggleField
				checked={form.enabled}
				description={ENABLED_FLAG_DESCRIPTION}
				id="farm-browser-edit-enabled"
				label={ENABLED_FLAG_LABEL}
				onChange={form.setEnabled}
			/>
			<FarmFormError message={form.error} />
			<DialogFooter>
				<Button onClick={onClose} type="button" variant="outline">
					取消
				</Button>
				<Button disabled={form.pending} type="submit">
					{form.pending ? "保存中…" : "保存"}
				</Button>
			</DialogFooter>
		</form>
	);
}

export function EditFarmBrowserDialog({
	onClose,
	open,
	row,
}: {
	onClose: () => void;
	open: boolean;
	row: FarmBrowser;
}) {
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>编辑「{browserDisplayName(row)}」</DialogTitle>
					<DialogDescription>
						浏览器名与版本是这一行的标识，不能改；要换标识请添加新行再删掉这一行。
					</DialogDescription>
				</DialogHeader>
				{/*
				 * 只在打开时挂载：表单的初值是从 row 抄进 useState 的，常挂着的话，
				 * 别处（比如轮询回来的新数据）改了这一行，框里还停在打开那一刻的旧值。
				 */}
				{open ? <EditFarmBrowserForm onClose={onClose} row={row} /> : null}
			</DialogContent>
		</Dialog>
	);
}
