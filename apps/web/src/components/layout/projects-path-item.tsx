import { Link } from "@tanstack/react-router";

import {
	HEADER_PATH_LINK_CLASS,
	type HeaderPathItem,
} from "@/components/layout/header-path";

/** 项目内各页面路径的第一项：链接回项目列表。 */
export const PROJECTS_PATH_ITEM: HeaderPathItem = {
	key: "projects",
	label: (
		<Link className={HEADER_PATH_LINK_CLASS} to="/projects">
			项目
		</Link>
	),
};
