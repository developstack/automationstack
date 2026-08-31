# 执行台「lg 下还能往下滚出一段空白」的根因与修复

日期：2026-08-29
页面：测试任务详情（执行台）
现象：lg 断点下页面本应恰好一屏（grid 定行已做完），但仍能整页往下滚，
滚到底是一段纯空白。之前改过的所有「高度」——h-screen、flex-1、grid 行模板——
都没能消掉它。

## TL;DR

**这从来不是高度问题，是 CSS 定位裁剪问题。**
用例列表每一行里有一段 `position:absolute` 的 sr-only 无障碍文案（「未测」等），
绝对定位元素只受**包含块链**上的 overflow 裁剪，而列表 `<ul>` 只有
`overflow-y-auto`、没有 `relative`，不是它们的包含块——于是这些元素
「越狱」出列表的滚动裁剪，直接把整页滚动区撑高。修复只有两个词：
给滚动容器加 `relative`。

## 排查过程（浏览器实测，1440×900）

1. 复现：整页滚动容器（`$projectId/route.tsx` 那层 `absolute inset-0
   overflow-y-auto`）scrollHeight **858** vs clientHeight **649**——
   多出 209px 可滚区域；用 `elementFromPoint` 探测滚到底后的空白区，
   命中的是滚动容器自己，即纯空白，没有任何可见内容。
2. 二分定位：对页面各块逐个 `display:none`，观察 scrollHeight 变化——
   隐藏用例列表 `<ul>` 后 scrollHeight 立刻回到 649。问题在列表里。
3. 锁定元凶：扫描 `offsetParent === 整页滚动容器` 的元素，找到 **22 个**
   `position:absolute` 的 `sr-only` span（`run-case-row.tsx:66` 的结论
   文字「未测」等）。最后一个的 bottom = **858**，与整页 scrollHeight
   分毫不差。
4. 现场验证：只给 `<ul>` 打上 `position:relative`，scrollHeight 858 → 649，
   maxScrollTop 归 0，截图确认视觉零变化。确认后才改源码。

## 机制：为什么改高度全都不生效

- Tailwind 的 `sr-only` 实现是 `position:absolute; width:1px; height:1px;
  overflow:hidden; clip-path: …`——视觉上看不见，但**它在布局树里的位置由
  包含块决定**。
- 绝对定位元素的包含块是**最近的 positioned 祖先**（relative/absolute/
  fixed/sticky）。`<ul>` 只有 `overflow-y-auto`，不 positioned，管不住它们；
  往上最近的 positioned 祖先是整页滚动容器（`absolute inset-0` 那层）。
- 结果：每一行的 sr-only 都按「行在文档流里的原始位置」挂在整页滚动容器上，
  完全无视 `<ul>` 的滚动裁剪。列表内容 858px 高、`<ul>` 只显示 400 多 px，
  被裁掉的那部分行的 sr-only 依然把整页 scrollHeight 撑到 858。
- 所以不管把用例区的高度怎么改（h-screen、grid 1fr 行……），可见布局都对，
  但整页的 scrollHeight 永远被这些幽灵元素钉在「列表未裁剪全高」上——
  这就是「改了不生效」的全部原因。

## 修复（2 个文件，各加一个 `relative`）

| 文件 | 位置 | 改动 |
| --- | --- | --- |
| `apps/web/src/components/test-runs/run-case-list.tsx` | 左栏用例清单 `<ul>` | `overflow-y-auto` → 加 `relative`（实测元凶） |
| `apps/web/src/components/test-runs/run-execution-layout.tsx` | 右栏详情滚动容器 | 同样加 `relative`（防御：附件拖放区等也有 sr-only） |

修复后硬刷新实测：`scrollHeight 649 === clientHeight 649`，maxScrollTop 0，
整页在 lg 下彻底滚不动；展开「变更历史」后用例区自动压缩（471px），
页面依旧不滚。视觉无任何变化。

## 沉淀的规则

> **凡 `overflow-y-auto` 的滚动容器，必须同时是包含块（加 `relative`）。**

否则容器里任何 `position:absolute` 的后代（sr-only、tooltip 锚点、拖放
覆盖层……）都会穿透它的滚动裁剪，把外层滚动区撑出幽灵空白。这类 bug 的
特征是：可见布局全对、改任何高度都无效、滚到底是纯空白。

两处改动的源码里都留了注释记录这条机制，防止将来有人把 `relative`
当装饰删掉。
