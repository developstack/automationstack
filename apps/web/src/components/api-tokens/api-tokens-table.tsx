import type { ApiTokenView } from "@automationstack/db/schema/api-tokens";
import { Badge } from "@automationstack/ui/components/badge";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
	formatLastUsedAt,
	tokenStatusLabel,
} from "@/components/api-tokens/api-token-meta";
import { ApiTokenRowActions } from "@/components/api-tokens/api-token-row-actions";
import { formatDateTime } from "@/components/cases/case-meta";
import { orpc } from "@/utils/orpc";

function ApiTokenRow({ token }: { token: ApiTokenView }) {
	const revoked = token.revokedAt !== null;

	return (
		/*
		 * 已吊销的行照样列出来（服务端刻意把它们一起回了）：吊销记录本身是要看的，
		 * 「那枚泄露的 token 到底停掉没有」只能在这儿得到回答。但它整行退到
		 * muted：它不再是可用凭据，不该和生效中的行抢同一份注意力。
		 */
		<TableRow className={revoked ? "text-muted-foreground" : undefined}>
			<TableCell className="font-medium">{token.name}</TableCell>
			{/* prefix 是列表页唯一能把行和手里那串明文对上的线索，等宽字体才好逐位核对 */}
			<TableCell className="font-mono text-xs">{token.prefix}…</TableCell>
			<TableCell>
				{/*
				 * 已吊销用 outline 而不是 destructive：它是一条既成事实，
				 * 用 destructive 会让它看起来像一条待处理的报错（同 members-table）。
				 */}
				<Badge variant={revoked ? "outline" : "secondary"}>
					{tokenStatusLabel(token.revokedAt)}
				</Badge>
			</TableCell>
			<TableCell className="text-muted-foreground">
				{formatDateTime(token.createdAt)}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{formatLastUsedAt(token.lastUsedAt)}
			</TableCell>
			<TableCell className="text-right">
				{/* 已吊销的行不再给按钮：吊销是单向的，再点一次只会拿到 NOT_FOUND */}
				{revoked ? null : <ApiTokenRowActions token={token} />}
			</TableCell>
		</TableRow>
	);
}

/*
 * 整段抄成常量而不是直接写在 JSX 里：格式化器按行宽折 JSX 文本，折点落在中文
 * 句读之间时会渲染出一个多余的空格（「写进流水线。 点上面的」）。
 */
const EMPTY_DESCRIPTION =
	"API Token 是给自动化脚本用的凭据：CI 跑完用例后拿它以你的身份把执行结果回传到测试计划里，不用把账号密码写进流水线。点上面的「新建 Token」创建第一枚。";

function ApiTokensEmpty() {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>还没有 API Token</EmptyTitle>
				<EmptyDescription>{EMPTY_DESCRIPTION}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

const SKELETON_ROW_KEYS = ["r1", "r2", "r3"] as const;

/**
 * 路由 pendingComponent 用的表格骨架。
 * 行高与真实行（TableCell 的 p-2 + 内容 20px）对齐，数据到达时表格不会长高。
 * 圆角覆盖成 rounded-none 的理由同 members-table：替身要跟真身同形，
 * 而表格行是方角的。
 */
export function ApiTokensTableSkeleton() {
	return (
		<output
			aria-busy="true"
			aria-label="Token 列表加载中"
			className="grid gap-2"
		>
			{SKELETON_ROW_KEYS.map((key) => (
				<Skeleton className="h-9 w-full rounded-none" key={key} />
			))}
		</output>
	);
}

export function ApiTokensTable() {
	const tokensQuery = useSuspenseQuery(orpc.apiTokens.list.queryOptions());

	if (tokensQuery.data.length === 0) {
		return <ApiTokensEmpty />;
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>备注名</TableHead>
					<TableHead>前缀</TableHead>
					<TableHead>状态</TableHead>
					<TableHead>创建时间</TableHead>
					<TableHead>最后使用</TableHead>
					{/* 空表头会被读屏念成一列没名字的单元格，用视觉隐藏的文字补上 */}
					<TableHead className="text-right">
						<span className="sr-only">操作</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{tokensQuery.data.map((token) => (
					<ApiTokenRow key={token.id} token={token} />
				))}
			</TableBody>
		</Table>
	);
}
