# dsh-usage-ledger

DeepSeek Harness（DSH）用量账本插件：跨会话保留 Token 用量，支持中文和英文界面。
会话删除后，已经记录的用量仍保留在账本中。

## 在 DSH 界面安装

1. 打开 DSH 侧边栏的 **插件（Plugins）**，点击 **添加插件（Add plugin）**。
2. 在插件地址输入框中粘贴下面的完整链接，确认安装：

   ```text
   https://github.com/xiyu-ljy/dsplugin/releases/download/v0.1.0/dsh-usage-ledger-0.1.0.tgz
   ```

3. 安装完成后选择 **立即启用（Enable now）**。如 DSH 提示需要重启，重启当前配置；
   刷新网页后，在侧边栏面板列表打开 **用量账本 / Usage ledger**。

也可以先在 [Releases](https://github.com/xiyu-ljy/dsplugin/releases) 下载 `.tgz`，
然后在同一个添加插件输入框中填写该文件在 **DSH 所在机器** 上的绝对路径。
远程连接 DSH 时，请使用上面的下载链接，或填写服务端文件路径。

这是包含前后端 JavaScript 的安装包，无需自行编译，也没有安装时运行的构建脚本。
请使用提供插件管理界面以及 `sidebar.panellist`、`uiWorkspace`、`layout` 的 DSH 0.2.x。
Node.js 版本还需满足所用 DSH 的要求。

## 命令行安装

```sh
dsh plugin --profile <profile> add https://github.com/xiyu-ljy/dsplugin/releases/download/v0.1.0/dsh-usage-ledger-0.1.0.tgz
```

命令执行完成后重启该配置，再刷新网页。

仓库根目录本身也是可安装的插件目录，可用 `github:xiyu-ljy/dsplugin#v0.1.0` 安装固定版本。
仅输入 `dsh-usage-ledger` 会去 npm 查找；本次分发使用 GitHub Release 下载链接。

---

A durable token-usage ledger for DeepSeek Harness. It keeps counting a session's
billed tokens **after the session is deleted**, and it can delete archived
sessions itself — snapshotting their usage first.

## Install

From a packed tarball or an unpacked folder:

```sh
dsh plugin --profile <profile> add ./dsh-usage-ledger-0.1.0.tgz
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
