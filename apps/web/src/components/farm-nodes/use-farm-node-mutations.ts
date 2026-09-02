/**
 * 节点管理页的六条写过程。集中在一处，是为了让**失效哪条查询**只写一遍：
 * 五条改的都是同一张表，任何一条漏掉 invalidate，页面就会停在旧值上，
 * 而用户刚点完确认、看到的却是没变的一行——那比报错更难查。
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

/**
 * 失效整张节点表。
 *
 * 一律整表重取、不做乐观更新：`online` 是服务端按心跳现算的派生列
 * （packages/api/src/lib/farm-node-online.ts），本地按 mutation 的返回值改一行
 * 根本拼不出它——`update` 回的是库里那一行，没有 `online`。硬要在本地补一个，
 * 就得把「90 秒窗口」这条判据在 web 再实现一遍，那是两份迟早会分头改的实现。
 */
function useInvalidateNodes() {
	const queryClient = useQueryClient();
	return useCallback(
		() =>
			queryClient.invalidateQueries({ queryKey: orpc.farm.nodes.list.key() }),
		[queryClient]
	);
}

/**
 * 新建。明文 token 只交给调用方的 `useState`，**只交给它**。
 *
 * 刻意不进 TanStack Query 缓存：缓存是会被 devtools 打开看、被 dehydrate 进
 * SSR 载荷、被别的组件顺手读到的地方，而这串东西等价于「让一台机器冒充节点
 * 接入」。列表那条 key 照常失效——列表回来的行里没有 token（仓储契约就不外泄
 * tokenHash），新行会自己冒出来。
 *
 * @param onCreated 收明文的回调。它必须在这一刻拿走：库里只存哈希，明文这辈子
 *   只在这个返回值里出现一次（同 api-tokens/create-api-token-dialog.tsx）。
 */
export function useCreateFarmNode(onCreated: (token: string) => void) {
	const invalidate = useInvalidateNodes();
	return useMutation(
		orpc.farm.nodes.create.mutationOptions({
			// 名字被服务端拒掉时，错误要留在对话框里挨着输入框说
			meta: { suppressErrorToast: true },
			onSuccess: (created) => {
				invalidate();
				toast.success(`节点「${created.node.name}」已创建`);
				onCreated(created.token);
			},
		})
	);
}

export function useUpdateFarmNode(onSuccess: () => void) {
	const invalidate = useInvalidateNodes();
	return useMutation(
		orpc.farm.nodes.update.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: (node) => {
				invalidate();
				toast.success(`节点「${node.name}」已更新`);
				onSuccess();
			},
		})
	);
}

/**
 * 行内的启用开关。与编辑框那条走同一个服务端过程，但**分开一个 hook**：
 * 这一下没有对话框可以承载错误，所以不设 `suppressErrorToast`，让全局那条
 * 错误 toast 去说——开关旁边没有地方摆一行红字，硬摆会把表格行撑高。
 * 成功文案也不同：这里要复述的是刚拨到的那一档，而不是笼统的「已更新」。
 * 不收节点参数：要复述的那一档只能取服务端回带的行（`updated`），拿调用方手里
 * 那份旧数据取反等于在猜结果——请求失败时那句话就是假的。
 */
export function useToggleFarmNodeEnabled() {
	const invalidate = useInvalidateNodes();
	return useMutation(
		orpc.farm.nodes.update.mutationOptions({
			onSuccess: (updated) => {
				invalidate();
				toast.success(
					updated.enabled
						? `节点「${updated.name}」已启用`
						: `节点「${updated.name}」已停用，不再接新会话`
				);
			},
		})
	);
}

/**
 * 轮换 token。新明文同样只交给调用方的 `useState`，理由同 `useCreateFarmNode`。
 * 不弹成功 toast：紧接着就会有一张摆着新 token 的对话框顶上来，页角再飘一句
 * 「已轮换」只会跟那张框抢注意力，而框里那句「只显示这一次」才是要紧的。
 */
export function useRotateFarmNodeToken(onRotated: (token: string) => void) {
	const invalidate = useInvalidateNodes();
	return useMutation(
		orpc.farm.nodes.rotateToken.mutationOptions({
			// NOT_FOUND（多半是别人刚把这台机器删了）要出现在刚点下的确认框里
			meta: { suppressErrorToast: true },
			onSuccess: (rotated) => {
				invalidate();
				onRotated(rotated.token);
			},
		})
	);
}

/**
 * 删除。
 *
 * `remove` **行不存在也不抛**，回 `{ ok: false }`（见
 * `packages/api/src/routers/farm-nodes.ts` 的注释）。所以这里必须分两路：
 * 报「已删除」而其实是别人先删掉的，会让管理员以为刚才那一下生效了——下次他
 * 再看到同名行时，第一反应会是「删除功能坏了」。两路都要 invalidate：无论哪种
 * 情况，手上这份列表都已经过期了。
 *
 * @param name 行名要在过程返回**之前**就抓在手里：`remove` 只回 `{ ok }`，
 *   而这一刻那一行已经不在列表里了，toast 里再想拼出「删掉的是哪一台」就没处取。
 */
/**
 * 重新探测这台机器的能力。**落的是意向标记，不是一次探测**——真正去问那台机器的
 * 是农场的下一拍（服务端那条的完整推导见 packages/api/src/routers/farm-nodes.ts）。
 *
 * 因此这里刻意**不弹成功 toast**：一句「已开始探测」会让人以为下一眼就能看到新
 * 清单，而它可能要等上几秒、机器离线时甚至要等到它回来。屏幕上真正该说这件事的
 * 是那颗按钮自己（进「探测中…」态，判据见 farm-node-capability-meta.ts），以及
 * 探完之后自己变新的那份清单。
 *
 * 失效整表而不是改本地那一行：`refreshPending` 是服务端按 `refreshRequestedAt`
 * 现算的，本地伪造一个等于把「什么时候算完成」这条判据在 web 再实现一遍。
 * 出错走全局 toast——按钮旁边没有地方摆红字，而这一下唯一可能的失败（节点刚被
 * 别人删了）本来就该用整页级别的说法。
 */
export function useRequestFarmNodeRefresh() {
	const invalidate = useInvalidateNodes();
	return useMutation(
		orpc.farm.nodes.requestRefresh.mutationOptions({
			onSuccess: () => {
				invalidate();
			},
		})
	);
}

export function useRemoveFarmNode(name: string, onSuccess: () => void) {
	const invalidate = useInvalidateNodes();
	return useMutation(
		orpc.farm.nodes.remove.mutationOptions({
			// 「这台机器上还有会话在跑」这类拒绝要留在确认框里，紧挨着刚点下的按钮
			meta: { suppressErrorToast: true },
			onSuccess: (result) => {
				invalidate();
				if (result.ok) {
					toast.success(`节点「${name}」已删除`);
				} else {
					toast.info(`节点「${name}」已不在列表中，列表已刷新`);
				}
				onSuccess();
			},
		})
	);
}
