import type { ApiTokenView } from "@automationstack/db/schema/api-tokens";
import { Badge } from "@automationstack/ui/components/badge";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
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
		<TableRow className={revoked ? "text-muted-foreground" : undefined}>
			<TableCell className="font-medium">{token.name}</TableCell>
			<TableCell className="font-mono text-xs">{token.prefix}…</TableCell>
			<TableCell>
				<Badge variant={revoked ? "outline" : "secondary"}>
					{tokenStatusLabel(token.revokedAt)}
				</Badge>
			</TableCell>
			<TableCell className="text-muted-foreground tabular-nums">
				{formatDateTime(token.createdAt)}
			</TableCell>
			<TableCell className="text-muted-foreground tabular-nums">
				{formatLastUsedAt(token.lastUsedAt)}
			</TableCell>
			<TableCell className="text-right">
				{revoked ? null : <ApiTokenRowActions token={token} />}
			</TableCell>
		</TableRow>
	);
}

const EMPTY_DESCRIPTION =
	"API Token 是给自动化脚本用的凭据：CI 跑完用例后拿它以你的身份把执行结果回传到测试计划里，不用把账号密码写进流水线。点上面的「新建 Token」创建第一枚。";

function ApiTokensEmpty() {
	return (
		<Empty className="items-start px-2 py-8 text-left">
			<EmptyHeader className="max-w-prose items-start">
				<EmptyTitle>还没有 API Token</EmptyTitle>
				<EmptyDescription>{EMPTY_DESCRIPTION}</EmptyDescription>
			</EmptyHeader>
		</Empty>
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
