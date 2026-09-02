import Docker from "dockerode";

import { parseDockerHost } from "./docker-host";

/**
 * 「这台机器上已经拉了哪些镜像」（docker 后端的能力上报，`capabilities.ts`）。
 *
 * ## 为什么只报**已拉取**的，而不是「能拉到的」
 *
 * 「能不能拉到」是 registry 的属性，不是这台机器的属性，而且要真的去问一次网络。
 * 能力清单要回答的是「派会话过来现在就能跑吗」——一个还没拉的镜像在 acquire
 * 时会先付几十秒到几分钟的拉取时间，那种延迟对上游是一次超时，不是一次成功。
 * 所以口径是：**磁盘上有的才算能力**。运维想让一台机器提供新浏览器，
 * 就在那台机器上 `docker pull` 一次，再点「重新探测」。
 *
 * 拆成独立文件而不是塞进 `docker.ts`：那个文件已经 281 行（上限 300），
 * 而这一段与槽位生命周期毫无关系——它不建容器、不认识 label、不认识会话。
 */

/** 列出已拉取镜像的 tag。失败**回空数组不抛**——探测的语气见 `detect-browsers.ts`。 */
export async function listPulledImages(dockerHost: string): Promise<string[]> {
	let docker: Docker;
	try {
		docker = new Docker(parseDockerHost(dockerHost));
	} catch {
		return [];
	}
	const images = await docker.listImages().catch(() => []);
	const tags: string[] = [];
	for (const image of images) {
		for (const tag of image.RepoTags ?? []) {
			// dangling 镜像的 RepoTags 是 `<none>:<none>`，它不是一个能 run 的引用。
			if (!tag.startsWith("<none>")) {
				tags.push(tag);
			}
		}
	}
	return tags;
}
