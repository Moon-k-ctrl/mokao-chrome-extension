# MoKao — 粉笔模考采集 Chrome 扩展

小白基于Ai agent完成的第一个项目，本身是想用Obsidian Web Clipper的网页剪藏功能搭建自己的本地知识库，但Obsidian Web Clipper无法正常读取排版和图片，导入我自己的爬取skill模板和Obsidian Web Clipper本身模板格式冲突。所以诞生了这个扩展程序
本项目的代码大部分参考了Obsidian Web Clipperd！
一款面向公考备考的 Chrome 扩展工具，自动从粉笔模考页面提取完整试卷（题目/选项/解析/图片/材料），生成带 YAML Frontmatter 的结构化 Markdown 笔记，通过剪贴板协议一键直存 Obsidian 知识库。

## ✨ 功能特性

- 🎯 **一键提取** — 自动采集 120 题完整试卷（题干、选项、答案、解析）
- 🖼️ **图片支持** — 提取题干图片、公式图片，支持 CSS 背景图和 SVG
- 📊 **分数爬取** — 自动获取考试成绩，可手动编辑
- 🏷️ **笔记属性面板** — 可编辑 title / date / source / tags / score 等属性
- 📝 **YAML Frontmatter** — 自动生成 Obsidian 兼容的元数据头
- 📂 **Obsidian 直存** — 通过 `obsidian://new&clipboard` 协议零配置保存，无大小限制
- 💾 **三级降级** — 剪贴板优先 → obsidian:// URI → 本地文件下载
- 🔧 **模板自定义** — 支持自定义题目/材料输出模板

## 📦 安装

1. 下载最新的 `mokao_vX.X.X.zip` 并解压
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启右上角 **开发者模式**
4. 点击 **加载已解压的扩展程序**，选择解压后的文件夹
5. 扩展图标出现在工具栏，安装完成

## 🚀 使用方法

1. **打开粉笔模考解析页** — 访问 `spa.fenbi.com` 的模考解析或报告页面
2. **点击扩展图标** — 弹出 MoKao 面板
3. **点击「检测页面」** — 自动识别页面内容
4. **编辑笔记属性** — 修改标题、标签、分数等
5. **保存到 Obsidian** — 一键直存，或下载 Markdown 文件

## 🛠️ 项目结构

```
mokao-chrome-extension/
├── manifest.json          # 扩展配置（Manifest V3）
├── content.js             # 页面注入脚本（DOM 提取逻辑）
├── popup.js               # 弹窗交互逻辑
├── popup.html             # 弹窗 UI
├── settings.html          # 设置页面
├── settings.js            # 设置逻辑
├── template.js            # 模板引擎
├── icon16.png             # 扩展图标
├── icon48.png
├── icon128.png
└── crawl-template.json    # 爬取模板配置
```

## 📋 技术细节

- **Manifest V3** — 符合 Chrome 最新扩展标准
- **Content Script** — 运行在粉笔页面上下文，自动拥有 DOM 和 Cookie 权限
- **Clipboard API** — `navigator.clipboard.writeText()` + `obsidian://new?clipboard` 实现无限制内容传输
- **无需后端** — 纯浏览器端运行，零配置，无需启动任何本地服务

## 🔄 版本历史

| 版本 | 变更 |
|------|------|
| v2.3.0 | 修复 tags 编辑 bug，新增 score 属性自动爬取 |
| v2.2.0 | 新增笔记属性面板（类似 Obsidian Web Clipper） |
| v2.1.0 | 自动提取试卷名称作为默认文件名 |
| v2.0.0 | 重构为剪贴板策略，移除 HTTP 服务器依赖 |
| v1.9.x | 早期版本，含本地服务器保存方案 |

## 📄 License

MIT License

## ⚠️ 免责声明

本工具仅供个人学习使用，请遵守粉笔网站的使用条款。提取的内容版权归原网站所有。
