/**
 * 「接入」抽屉：三段可复制的示例代码 + 一句 token 从哪来。
 *
 * 为什么是抽屉而不是另开一页：这份东西是**边看边抄**的——人多半刚起完一条会话
 * 想对一下参数，或者列表空着不知道下一步做什么。另开一页会把他从列表挪走，
 * 回来还得重新筛一遍。
 *
 * 三段代码由 connect-snippets.ts 纯函数生成（有单测），这一层只负责摆。
 * 农场地址取 `env.VITE_FARM_URL`：`packages/env/src/web.ts` 里已经声明过它，
 * 走这个入口而不是裸 `import.meta.env` 有两个原因——一是本仓所有 web 侧环境变量
 * 都从那里读（校验与默认值只有一份），二是它是**构建期烘焙**的常量，SSR 与
 * 浏览器读到的是同一个字面量，不会 hydration mismatch。
 */
import { env } from "@automationstack/env/web";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@automationstack/ui/components/sheet";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@automationstack/ui/components/tabs";
import { Link } from "@tanstack/react-router";

import { DocCodeBlock } from "@/components/docs/doc-code-block";
import {
	buildConnectSnippets,
	TOKEN_PLACEHOLDER,
} from "@/components/farm/connect-snippets";
import { TOKENS_TAB } from "@/components/settings/settings-tab";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

/**
 * 比默认抽屉宽（默认 sm:max-w-sm 只有 384px），但远窄于用例选择器那种
 * max-w-7xl：最长的一行示例代码约 70 个等宽字符，text-xs 下 ≈ 500px，
 * 2xl（672px）装得下且不必横向滚。
 */
const CONNECT_SHEET_CLASS = "w-full! gap-0 p-0 sm:w-11/12! sm:max-w-2xl!";

/**
 * token 那句提示。单独一个组件是因为它里面有一条跨页跳转，
 * 而链接目标（项目设置的 API Token 那一格）是个有具体理由的选择：
 * token 是**个人级**的，但本仓把它收进了项目设置页的第三格（见
 * routes/projects/$projectId/settings.tsx 的头注释），所以这里必须带上
 * 当前 projectId，否则那个路由压根拼不出来。
 */
function TokenHint({ projectId }: { projectId: string }) {
	return (
		<p className="text-muted-foreground text-xs">
			代码里的 <code className="font-mono">{TOKEN_PLACEHOLDER}</code>{" "}
			要换成你自己的 API Token。到{" "}
			<Link
				className="underline underline-offset-2"
				params={{ projectId }}
				search={{ tab: TOKENS_TAB }}
				to="/projects/$projectId/settings"
			>
				设置 · API Token
			</Link>{" "}
			里生成一枚；明文只在创建那一刻显示一次，所以这里不会替你填上。
		</p>
	);
}

export interface ConnectGuideProps {
	onClose: () => void;
	open: boolean;
	projectId: string;
}

export function ConnectGuide({ onClose, open, projectId }: ConnectGuideProps) {
	const handleOpenChange = useCloseOnDismiss(onClose);
	/*
	 * 每次渲染重算而不是 useMemo：三段模板字符串的拼接成本远低于一个 memo 的
	 * 心智负担，而且这个抽屉多数时候是关着的（open=false 时下面整段不渲染）。
	 */
	const snippets = buildConnectSnippets({
		farmUrl: env.VITE_FARM_URL,
		projectId,
	});

	return (
		<Sheet onOpenChange={handleOpenChange} open={open}>
			<SheetContent className={CONNECT_SHEET_CLASS} side="right">
				<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
					<SheetHeader className="p-0">
						<SheetTitle>接入浏览器农场</SheetTitle>
						<SheetDescription>
							把下面任意一段抄进你的脚本，跑起来后这条会话就会出现在列表里，
							网络记录、Console 与截图由农场自动录，不用你在脚本里做任何事。
						</SheetDescription>
					</SheetHeader>
					<TokenHint projectId={projectId} />
					<Tabs defaultValue={snippets[0].id}>
						<div className="shrink-0 overflow-x-auto">
							<TabsList>
								{snippets.map((snippet) => (
									<TabsTrigger key={snippet.id} value={snippet.id}>
										{snippet.title}
									</TabsTrigger>
								))}
							</TabsList>
						</div>
						{snippets.map((snippet) => (
							<TabsContent key={snippet.id} value={snippet.id}>
								<DocCodeBlock code={snippet.code} language={snippet.language} />
							</TabsContent>
						))}
					</Tabs>
					<p className="text-muted-foreground text-xs">
						农场地址：<code className="font-mono">{env.VITE_FARM_URL}</code>
						。这是部署时烘焙进前端的值，与运维配的地址不一致时找管理员改
						<code className="font-mono"> VITE_FARM_URL</code>。
					</p>
				</div>
			</SheetContent>
		</Sheet>
	);
}
