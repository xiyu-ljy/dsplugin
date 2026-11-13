# dsh-usage-ledger

DeepSeek Harness（DSH）用量账本插件：跨会话保留 Token 用量，支持中文和英文界面。
会话删除后，已经记录的用量仍保留在账本中。

## 参考来源与本项目扩展

本插件的用量概览和可视化展示参考了 [dsh-context](https://github.com/bowenliang123/dsh-context)
的 **Context Insights / 上下文洞察** 页面，原作者为
[bowenliang123](https://github.com/bowenliang123)。上游项目采用
[Apache-2.0 许可证](https://github.com/bowenliang123/dsh-context/blob/main/LICENSE)。感谢原作者的开源分享。

本项目在这一参考基础上，扩展了独立的持久用量账本、会话删除后保留统计、
归档／删除管理、工作区路径回填，以及本项目的紧凑视图和页内详情。

统计概览与会话明细显示在 **同一个页面**：上方查看统计，下方查看会话。
只有会话列表分页，保留筛选、搜索和排序，以及每页数量和跳页控制；卡片自动每页 9 个，
列表自动每页 25 条，也可选择每页 12、24 或 48 条。查看详情后返回会保留筛选、页码和滚动位置。

只有标题、路径或模型信息的空会话暂不显示，也不计入会话数量；产生实际对话或用量后
自动显示。未命名但已有实际活动的会话仍会保留，历史账本记录和已发生的用量不会删除。

## 0.1.3 更新

- 恢复统计和会话列表共用单页，移除“概览／会话明细”页签，仅对会话列表分页。
- 来源署名移到页面标题旁；翻页定位到列表，查看详情后返回保留原位置。

## 0.1.2 更新

- 活跃度和技能加载并入概览网格，移除独占整行的折叠区；不同窗口宽度自动重排。

- 图表、技能与每日用量详情改为插件页内查看，保留顶部导航；返回时恢复滚动位置。
- 耗时环图使用紧凑数字与独立单位，悬停可查看完整时长。
- 概览和会话明细拆为独立页签，切换时保留筛选与页码。
- 会话列表与卡片支持每页数量、上一页／下一页和直接跳页；卡片默认每页 9 个。
- 仅有元信息的空会话不展示、不计数；已有实际对话或用量的未命名会话仍保留。
- 兼容历史空记录补齐活动信息，保留子代理的父会话分组和全部历史用量。
- 在界面与文档注明参考 bowenliang123/dsh-context，并说明本项目的扩展功能。

## 0.1.1 更新

- 六项统计横向排列，会话默认使用紧凑列表，可搜索、排序、分页并切换为卡片。
- 点击每日消耗、活跃度格子、技能、Token／耗时构成，可查看详情和相关会话。
- 归档、删除等操作显示处理状态，失败可重试；显示偏好会保留。
- 移除技能加载区的冗余小字，补齐历史会话的工作区路径。

## 在 DSH 界面安装

1. 打开 DSH 侧边栏的 **插件（Plugins）**，点击 **添加插件（Add plugin）**。
2. 在插件地址输入框中粘贴下面的完整链接，确认安装：

   ```text
   https://github.com/xiyu-ljy/dsplugin/releases/latest/download/dsh-usage-ledger.tgz
   ```

3. 安装完成后选择 **立即启用（Enable now）**。如 DSH 提示需要重启，重启当前配置；
   刷新网页后，在侧边栏面板列表打开 **用量账本 / Usage ledger**。

也可以先在 [Releases](https://github.com/xiyu-ljy/dsplugin/releases) 下载 `.tgz`，
然后在同一个添加插件输入框中填写该文件在 **DSH 所在机器** 上的绝对路径。
远程连接 DSH 时，请使用上面的下载链接，或填写服务端文件路径。

固定地址指向最新正式 Release；已安装的插件不会因此自动升级。已安装旧版时，可在插件管理页卸载旧版，再使用上面的链接安装。如安装器仍复用缓存，可使用下方固定版本地址。

需要固定版本时，使用：

```text
https://github.com/xiyu-ljy/dsplugin/releases/download/v0.1.3/dsh-usage-ledger-0.1.3.tgz
```

这是包含前后端 JavaScript 的安装包，无需自行编译，也没有安装时运行的构建脚本。
请使用提供插件管理界面以及 `sidebar.panellist`、`uiWorkspace`、`layout` 的 DSH 0.2.x。
Node.js 版本还需满足所用 DSH 的要求。

## 命令行安装

```sh
dsh plugin --profile <profile> add https://github.com/xiyu-ljy/dsplugin/releases/latest/download/dsh-usage-ledger.tgz
```

命令执行完成后重启该配置，再刷新网页。

仓库根目录本身也是可安装的插件目录，可用 `github:xiyu-ljy/dsplugin#v0.1.3` 安装固定版本。
仅输入 `dsh-usage-ledger` 会去 npm 查找；本次分发使用 GitHub Release 下载链接。

---

A durable token-usage ledger for DeepSeek Harness. It keeps counting a session's
billed tokens **after the session is deleted**, and it can delete archived
sessions itself — snapshotting their usage first.

## Install

From a packed tarball or an unpacked folder:

```sh
dsh plugin --profile <profile> add ./dsh-usage-ledger-0.1.3.tgz
# or
dsh plugin --profile <profile> add ./dsh-usage-ledger
```

Restart the profile after a CLI installation, then reload the web UI. For a GUI
installation, choose **Enable now** and restart if DSH requests it.
The plugin appears as **Usage ledger / 用量账本** in the
sidebar panel list. It needs a Harness whose client exposes `sidebar.panellist`,
`uiWorkspace` and `layout` (the 0.2.x line).

Everything it stores lives in that machine's `$DSH_HOME` — nothing travels with
the package except the code.

## Why

The Context Insights page (`dsh-context`) reads every session's own log and
projection cache. Deleting a session removes the artifact directory, the
projection cache document and the archive index entry together, so that
session's tokens disappear from every total. Nothing is wrong with that page —
it simply has no data left to read.

This plugin keeps a second, independent store that a session delete never
touches, and renders it on its own page.

## Three states

| State | Decided by | Tokens |
| --- | --- | --- |
| **Active** | cache document present, not in the archive index | still growing |
| **Archived** | cache document present, in the archive index | frozen |
| **Deleted** | cache document gone, ledger record kept | frozen, ledger only |

The page reports **current = active + archived**, plus **deleted**, plus the
**total**. Filters and badges use the same three states.

Subagent sessions are **folded into the session that started them**: one row per
top-level session, its subagent tokens included, with a `N subagents` chip. The
parent link comes from the first frame of the session log (`parentSession`,
`origin: "subagent"`), because the projection cache does not carry it. When a
parent is gone from the ledger entirely, its children still fold together under
its id and the row is labelled **Parent not recorded** instead of scattering one
row per subagent.

## What it does

- **Live** — listens on `session/event` and folds each committed
  `assistant/message`'s provider-reported usage, replacing (not adding) a
  re-settled `(turn, step)` so retries are not double billed.
- **Backfill** — on first activation, reads every session's projection cache
  (`$DSH_HOME/storages/session_projcache/sessions/<id>.json`) once, taking
  `tokenUsage.totals` and the per-request `contextTimeline.requests` for the
  daily split.
- **Deletion** — an **Archived** row can be deleted from this page:
  1. snapshot that session's cache into the ledger (never lowers a figure the
     live feed already produced);
  2. move its log directory and cache document into this plugin's trash;
  3. drop its archive index entry (deferred while the host still holds the
     Session, so the row cannot come back as a ghost);
  4. mark the record **deleted** — the tokens stay.
  It refuses a running session, a session with running subagents, and a session
  that is not archived.
- **Sweeps** — every `sweepMinutes`, sessions whose cache document disappeared
  are marked deleted, expired trash is purged, and deferred index drops retry.

## Where the data lives

```
$DSH_HOME/dsh-usage-ledger/ledger.json      the durable ledger
$DSH_HOME/dsh-usage-ledger/trash/<id>/      deleted session's log + cache
```

(`$DSH_HOME` defaults to `~/.dsh`; the ledger is written atomically through a
temporary file and a rename.)

## Configuration

```yaml
- id: usage-ledger
  name: dsh-usage-ledger
  config:
    backfill: true          # seed history from the projection cache on first run
    sweepMinutes: 10        # delete detection, trash purge, deferred drops
    includeSubagents: true
    payloadDays: 120        # days of per-session daily buckets sent to the page
    trashRetentionDays: 30  # recoverable window; 0 deletes with no recycle copy
```

## Known limits

- **Only what the ledger saw.** Sessions permanently deleted before this plugin
  was installed cannot be recovered: their log and cache are gone.
- **Archived index-only rows are not listed.** An archive entry whose cache and
  log are both gone has no usage to report; it still counts toward
  `archivedIndex` in the payload.
- **The Context Insights page is unchanged.** This is a parallel source of
  truth, not a patch for that page.
