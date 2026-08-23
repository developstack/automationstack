/**
 * AI 配置页：全平台唯一的一份 provider + model + base URL + API Key。
 *
 * 四个过程都是 adminProcedure，所以这里和成员管理用同一套判断：先看会话角色，
 * 非管理员就地说清楚「这页要管理员」，而不是把 FORBIDDEN 丢给全站兜底的错误边界
 * （router.tsx 的 defaultErrorComponent）——那儿只能原样转述服务端那句话，
 * 再给一颗对权限问题毫无用处的重试按钮。
 */
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useSession } from "@/components/auth/use-session";
import { ProviderConfigForm } from "@/components/provider/provider-config-form";
import { ProviderConfigSkeleton } from "@/components/provider/provider-config-skeleton";
import { ProviderConfigStatus } from "@/components/provider/provider-config-status";
import { orpc } from "@/utils/orpc";

function ProviderConfigForbidden() {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>需要管理员权限</EmptyTitle>
				<EmptyDescription>
					AI
					配置全平台只有一份，只有管理员能改。需要接入新的模型请联系管理员；也可以直接回到
					{/* 正文里的链接必须自带下划线：只靠颜色区分不够 */}
					<Link className="underline underline-offset-4" to="/projects">
						项目列表
					</Link>
					。
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

function ProviderConfigContent() {
	const stateQuery = useSuspenseQuery(orpc.aiProviderConfig.get.queryOptions());

	return (
		// gap-8 对内部各组的 gap-4：组间距是组内距的两倍，分组靠留白而不靠线
		<div className="flex flex-col gap-8">
			<ProviderConfigStatus state={stateQuery.data} />
			<ProviderConfigForm state={stateQuery.data} />
		</div>
	);
}

export function ProviderConfigPage() {
	const { isPending, user } = useSession();

	if (isPending) {
		return <ProviderConfigSkeleton />;
	}
	if (user?.role !== "admin") {
		return <ProviderConfigForbidden />;
	}
	return <ProviderConfigContent />;
}
