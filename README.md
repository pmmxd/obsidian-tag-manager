# Tag Manager / 标签管理器

[中文](#中文) | [English](#english)

Tag Manager 是一个 Obsidian 标签与文件管理插件，使用左右双列界面快速浏览、筛选和整理标签下的笔记。

> 本项目未上架 Obsidian 社区插件市场，请使用手动安装。

## 功能

- 左侧标签列表、右侧文件列表的双列布局
- 展开或折叠全部标签
- 按文件数量排序标签，并显示 Markdown 文件计数
- 按创建时间、修改时间或文件名排序文件
- 实时搜索标签和文件
- 右键新建文件时自动添加当前标签
- 可忽略指定文件夹和标签
- 可自定义文件夹与文件图标
- 可选择启动时自动打开视图

## 安装

1. 从本仓库下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 在 Vault 中创建目录 `.obsidian/plugins/tag-manager/`。
3. 将三个文件放入该目录。
4. 重启 Obsidian，在“设置 > 第三方插件”中启用 `标签管理器`。

## 开发

```bash
npm install
npm run dev
npm run build
```

## English

Tag Manager provides a two-column tag and file browser for Obsidian.

### Features

- Tag list on the left and matching Markdown files on the right
- Expand or collapse all tags
- Sort tags by file count and show Markdown file counts
- Sort files by creation time, modification time, or name
- Search tags and files
- Create a new note with the active tag from the context menu
- Ignore folders and tags through settings
- Custom folder and file icons
- Optional auto-open on startup

### Installation

1. Download `main.js`, `manifest.json`, and `styles.css`.
2. Create `.obsidian/plugins/tag-manager/` in your vault.
3. Put the three files in that directory.
4. Restart Obsidian and enable `Tag Manager` under **Settings > Community plugins**.

This plugin is not currently listed in the Obsidian Community Plugins directory.
