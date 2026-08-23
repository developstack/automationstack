import { Button } from "@automationstack/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link, useRouter } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";
import { useCallback } from "react";

import { PageTransition } from "@/components/layout/page-transition";

/**
 * 取不到服务端 message 时的说法。刻意不回落到 error.name / stack：
 * 那些字符串对用户没有任何可操作性，只会让人以为是自己弄坏了什么。
 */
const FALLBACK_DESCRIPTION =
	"服务端没有给出原因。可以重试一次，若一直失败请联系管理员。";

/**
 * 与 utils/orpc.ts 里那个全局 query 错误 toast 同一个取法：oRPC 的 ORPCError 是
 * Error 的子类，服务端写的中文 message 原样挂在 `.message` 上，直接展示即可。
 *
 * 这里比 toast 多放宽一层——只要是「带非空字符串 message 的对象」就认。原因是
 * loader 在 SSR 期间抛出的错误要序列化过一遍才到浏览器，注水后未必还是 Error
 * 实例；用 instanceof 判会在那条路径上白白掉到兜底文案。
 */
function getServerMessage(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null || !("message" in error)) {
		return undefined;
	}
	const { message } = error;
	if (typeof message !== "string" || message.trim() === "") {
		return undefined;
	}
	return message;
}

/**
 * 全站兜底错误页：挂在 router 的 defaultErrorComponent 上，接住 loader/beforeLoad
 * 抛出的错，以及路由组件子树里渲染期抛出的错（useSuspenseQuery 失败即属此类）。
 * 没有它的话这两类错误会一路冒到 React 根部，把外壳一起卸载成白页。
 *
 * 与 router.tsx 里的 NotFoundPage 是一对：同样的 PageTransition + Empty 结构、
 * 同样用 <h1> 当标题。这里不写 document.title——本仓库的标题归 HeadContent 管
 * （见各路由的 head 选项），在这儿手写会和它打架；NotFoundPage 只能手写是因为
 * 404 时压根没有匹配上的路由，也就没有 head。
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
	const router = useRouter();
	const description = getServerMessage(error) ?? FALLBACK_DESCRIPTION;

	const handleRetry = useCallback(() => {
		/*
		 * 只调 reset 是不够的：它仅仅把边界自己的 error state 清空，loader 那份
		 * 失败结果还留在 match 上，重挂载的下一帧又会抛。invalidate 才是重来一次
		 * ——它把已提交的 match 标脏、把 error 状态的 match 拨回 pending 并重跑
		 * loader，顺带换掉 match 对象，CatchBoundary 的 getResetKey 也就跟着复位。
		 *
		 * reset 仍然要调，是为渲染期抛的错：那种情况下 match 还是 success，
		 * invalidate 换出的新 match 虽然也能复位边界，但显式 reset 让「重新挂载
		 * 子树、让 useSuspenseQuery 重新发起」这件事不依赖 match 的对象身份。
		 * 写成可选调用是因为 SSR 那条渲染路径传的 reset 是 undefined。
		 */
		router.invalidate();
		reset?.();
	}, [reset, router]);

	return (
		<PageTransition className="container mx-auto flex max-w-5xl items-center px-4 py-6">
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<TriangleAlertIcon />
					</EmptyMedia>
					<EmptyTitle>
						<h1>页面加载失败</h1>
					</EmptyTitle>
					<EmptyDescription>{description}</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button onClick={handleRetry} size="sm">
						重试
					</Button>
					<Link className="text-sm underline underline-offset-4" to="/projects">
						返回项目列表
					</Link>
				</EmptyContent>
			</Empty>
		</PageTransition>
	);
}
