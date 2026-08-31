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
			{/*
			 * 两列时间戳走 tabular-nums：formatDateTime 是 zh-CN 的
			 * short/short（25/8/30 14:03），比例字体下 1 比 0 窄一截，同一列里
			 * 逐行的年月日与冒号因此对不齐，上下比「哪枚最近用过」时每行都要
			 * 重新找位。「从未使用」那种非数字取值不受影响。
			 */}
			<TableCell className="text-muted-foreground tabular-nums">
				{formatDateTime(token.createdAt)}
			</TableCell>
			<TableCell className="text-muted-foreground tabular-nums">
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

/*
 * 空态与表格**同轴**。
 *
 * Empty 原件是 `items-center justify-center p-12 text-center`，而这块空态占的
 * 正是表格的位置，表格的内容从 TableCell / TableHead 的 px-2（8px）起排。两态
 * 照原件渲染的结果是：有 token 时第一个字在左边缘 +8px，没有 token 时第一个字
 * 在面板正中——同一块地方的视线落点隔着大半个面板宽，切换时要重新找。
 *
 * 所以左内边距压到 px-2 与表格对齐、改左对齐；纵向单独给 py-8，不跟着 p-12 走
 * （p-12 那 48px 是给整屏空态用的，塞在一句作用域提示和一颗按钮下面会把这段
 * 说明推到半空）。px-2 / py-8 写在 p-12 后面靠 Tailwind 自身的属性序生效
 * （padding 先于 padding-inline / padding-block），与仓库里其它覆盖同一路数。
 *
 * EmptyHeader 的 max-w-sm 换成 max-w-prose：384px 是给居中窄栏用的，左对齐之后
 * 这段长说明会折成六七行，比它要替代的表格还高。
 */
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
