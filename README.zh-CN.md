# fifi-video

纯代码做视频的工具。每一帧都是 HTML / Canvas / JS，由 Chrome 逐帧渲染，不用任何视频生成模型。

<p align="center"><a href="README.md">English</a> · <b>中文</b> · <a href="AGENTS.md">给 AI agent 看的</a></p>

<p align="center"><img src="assets/promo.gif" width="100%"></p>
<p align="center"><a href="https://x.com/jay187950667114/status/2116361956378460558">完整宣传片 @ X</a> <!-- TODO: B 站 · YouTube 链接 --></p>

## 已开放

| | 模块 | 状态 |
|---|---|---|
| <img src="assets/motion-components.jpg" width="360"> | **[motion 动画组件](motion/)**<br>29 个动画组件 + 渲染管线 | ✅ v0.1 |
| | 口播粗剪 | 即将开放 |
| | 后期 BGM、音效 | 即将开放 |
| | 封面 prompt | 即将开放 |
| | 标题 | 即将开放 |

## 这些组件有什么不一样

- **人工反馈精选，RLHF 式。** 每个组件都经过多轮：渲染 → 我逐帧看 → 打分 → 改。只有评到 A、B 的才放出来，其余的都砍掉了，所以看不出 AI 味。
- **可复用。** 组件只是一个画面框架，文字、图片、颜色、时间全是参数，同一个组件换个题目照样能用。
- **任何 AI 都能用。** 设计都在组件里，agent 只需要填文字和时间，所以不需要最新的模型。只要能读文件、能跑命令的编程 agent 都行。已测过：只给这个 repo，Claude Sonnet 5.5 和 Claude Haiku 5.5 各自做出一支 15 秒宣传片，出片检查全部通过。

## 快速开始

把这个 repo 交给你的编程 agent（Claude Code、Codex、Cursor……），对它说：

> 用 fifi-video/motion 做一支 10 秒 1920×1080 的片头，内容是“Hello, world”。

或者自己跑：

```bash
cd motion && npm install
bash scripts/new_project.sh ../my-video
bash scripts/build.sh ../my-video      # 逐帧渲染 → 音效 → my-video.mp4
```

需要 Node 18+、Google Chrome、Python 3（numpy）、ffmpeg。

## 展示作品（和工具无关）

[`animation/`](animation/) 放的是几支 AI 做好的成片，每支附完整源码或当时用的 prompt。它们不属于 fifi-video：不用 `motion/`，repo 里也没有任何东西依赖它们。**用这套工具不需要它们**，可以这样 clone，不下载这个文件夹：

```bash
git clone --filter=blob:none --sparse https://github.com/huiq777/fifi-video.git
cd fifi-video && git sparse-checkout set motion
```

## 参与贡献

欢迎报 bug、提修复、加新组件，见 [CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)。

## 许可证

代码：[MIT](LICENSE)。自带字体沿用各自的 OFL / Apache 许可（`motion/components/explainer/xm-assets/fonts/`）。

作者：小火火Fifi。
