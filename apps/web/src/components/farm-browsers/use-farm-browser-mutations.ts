/**
 * 浏览器目录的三条写过程。集中在一处，是为了让**失效哪条查询**只写一遍：
 * 三条过程改的都是同一张表，任何一条漏掉 invalidate，页面就会停在旧值上，
 * 而用户刚点完确认、看到的却是没变的一行——那比报错更难查。
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { browserDisplayName } from "@/components/farm-browsers/farm-browser-meta";
import { orpc } from "@/utils/orpc";

/**
 * 失效整张目录表。
 *
 * 三条过程一律整表失效、不做乐观更新：`isDefault` 是**一张表里只能有一个真**
 * 的字段，把某一行设为默认会顺带把原来的默认行改掉——那一行的变化只有服务端
 * 知道，本地按返回值改一行会留下两个默认行的假象。整表重取一次的代价是一个
 * 请求，换来的是屏幕上永远是服务端认定的那份目录。
 */
function useInvalidateBrowsers() {
	const queryClient = useQueryClient();
	return useCallback(
		() =>
			queryClient.invalidateQueries({
				queryKey: orpc.farm.browsers.list.key(),
			}),
		[queryClient]
	);
}

export function useCreateFarmBrowser(onSuccess: () => void) {
	const invalidate = useInvalidateBrowsers();
	return useMutation(
		orpc.farm.browsers.create.mutationOptions({
			// 「这个 browser+version 已存在」是本表单最常见的失败，错误要留在对话框里
			meta: { suppressErrorToast: true },
			onSuccess: (row) => {
				invalidate();
				toast.success(`「${browserDisplayName(row)}」已加入目录`);
				onSuccess();
			},
		})
	);
}

export function useUpdateFarmBrowser(onSuccess: () => void) {
	const invalidate = useInvalidateBrowsers();
	return useMutation(
		orpc.farm.browsers.update.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: (row) => {
				invalidate();
				toast.success(`「${browserDisplayName(row)}」已更新`);
				onSuccess();
			},
		})
	);
}

/**
 * 删除。
 *
 * `remove` **行不存在也不抛**，回 `{ ok: false }`（见
 * `packages/api/src/routers/farm-browsers.ts` 的注释）。所以这里必须分两路：
 * 报「已移除」而其实是别人先删掉的，会让管理员以为刚才那一下生效了——下次他
 * 再看到同名行时，第一反应会是「删除功能坏了」。两路都要 invalidate：无论哪种
 * 情况，手上这份列表都已经过期了。
 *
 * @param name 行名要在过程返回**之前**就抓在手里：`remove` 只回 `{ ok }`，
 *   而这一刻那一行已经不在列表里了，toast 里再想拼出「删掉的是哪一行」就没处取。
 */
export function useRemoveFarmBrowser(name: string, onSuccess: () => void) {
	const invalidate = useInvalidateBrowsers();
	return useMutation(
		orpc.farm.browsers.remove.mutationOptions({
			// 「仍有会话在用这个镜像」这类拒绝要留在确认框里，紧挨着刚点下的按钮
			meta: { suppressErrorToast: true },
			onSuccess: (result) => {
				invalidate();
				if (result.ok) {
					toast.success(`「${name}」已从目录移除`);
				} else {
					toast.info(`「${name}」已不在目录中，列表已刷新`);
				}
				onSuccess();
			},
		})
	);
}
