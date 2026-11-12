import { Plugin, WorkspaceLeaf, Notice, Modal } from 'obsidian';
import { TagView, VIEW_TYPE_TAG } from './TagView';
import { TagManagerSettings } from './TagManagerSettings';
import { TagManagerSettingTab } from './TagManagerSettingTab';
import { TagRenameModal } from './TagRenameModal';
import { DeleteTagModal } from './DeleteTagModal';
const DEFAULT_SETTINGS: TagManagerSettings = {
    autoOpen: false,
    ignoreFolders: [],
    ignoreTags: [],
    folderIcon: '📁',
    fileIcon: '📄',
    tagColumnWidth: 250,
    enableRainbowOutline: true,
    showTagToggleTriangle: true, // 新增：默认显示三角形
};

export default class TagManagerPlugin extends Plugin {
    settings: TagManagerSettings;

    async onload() {
        await this.loadSettings();

        // 加载 CSS 样式
        this.loadStyles();

        // 注册视图
        this.registerView(
            VIEW_TYPE_TAG,
            (leaf: WorkspaceLeaf) => new TagView(leaf, this)
        );

        // 添加图标到左侧栏
        this.addRibbonIcon('tags', '标签管理器', () => {
            this.activateView();
        });

        // 添加设置选项卡
        this.addSettingTab(new TagManagerSettingTab(this.app, this));

        // 如果设置为自动打开，则激活视图
        if (this.settings.autoOpen) {
            this.activateView();
        }
    }

    async loadStyles() {
        const styleEl = document.createElement('style');
        styleEl.id = 'tag-manager-styles';
        document.head.appendChild(styleEl);
        
        // 加载 styles.css 文件内容
        if (this.manifest.dir) {
            styleEl.textContent = await this.app.vault.adapter.read(`${this.manifest.dir}/styles.css`);
        }
    }

    async onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_TAG);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async activateView() {
        const { workspace } = this.app;

        // 如果视图已经打开，激活它
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_TAG)[0];
        if (leaf) {
            workspace.revealLeaf(leaf);
            return;
        }

        // 创建新的视图
        const leftLeaf = workspace.getLeftLeaf(false);
        if (leftLeaf) {
            await leftLeaf.setViewState({
                type: VIEW_TYPE_TAG,
                active: true,
            });

            leaf = workspace.getLeavesOfType(VIEW_TYPE_TAG)[0];
            if (leaf) {
                workspace.revealLeaf(leaf);
            }
        }
    }

    getTagView(): TagView | null {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TAG);
        if (leaves.length === 0) {
            return null;
        }
        return leaves[0].view as TagView;
    }
	// 获取 Obsidian 默认的新建笔记路径
	getDefaultNewNotePath(): string {
		// @ts-ignore - 访问内部 API
		const newFilePath = this.app.vault.getConfig('newFileFolderPath');
		return newFilePath || '/'; // 如果未设置，则使用根目录
	}
	// 重命名标签
	async renameTag(oldTag: string, newTag: string): Promise<boolean> {
		try {
			if (oldTag === newTag) {
				new Notice('新标签名与原标签名相同');
				return false;
			}

			// 确保标签格式正确
			if (!oldTag.startsWith('#')) oldTag = '#' + oldTag;
			if (!newTag.startsWith('#')) newTag = '#' + newTag;

			// 获取所有包含该标签的文件
			const files = this.app.vault.getMarkdownFiles();
			let updatedCount = 0;

			for (const file of files) {
				const content = await this.app.vault.read(file);

				// 检查文件是否包含旧标签
				if (this.fileContainsTag(content, oldTag)) {
					// 替换标签，确保只替换完整的标签（不影响其他标签）
					const newContent = this.replaceTag(content, oldTag, newTag);

					// 如果内容有变化，则更新文件
					if (newContent !== content) {
						await this.app.vault.modify(file, newContent);
						updatedCount++;
					}
				}
			}

			new Notice(`已更新 ${updatedCount} 个文件中的标签 ${oldTag} 为 ${newTag}`);

			// 刷新标签视图
			const tagView = this.getTagView();
			if (tagView) {
				await tagView.refreshView();
			}

			return true;
		} catch (error) {
			console.error('重命名标签失败:', error);
			new Notice('重命名标签失败');
			return false;
		}
	}

	// 检查文件内容是否包含指定标签
	private fileContainsTag(content: string, tag: string): boolean {
		// 转义正则表达式中的特殊字符
		const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		// 使用正则表达式匹配完整的标签
		const tagRegex = new RegExp(`${escapedTag}(?=[\\s,.]|$)`, 'g');

		// 检查正文中的标签
		if (tagRegex.test(content)) {
			return true;
		}

		// 检查YAML frontmatter中的标签
		const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
		const frontmatterMatch = content.match(frontmatterRegex);

		if (frontmatterMatch) {
			const frontmatter = frontmatterMatch[1];
			const cleanTag = tag.startsWith('#') ? tag.substring(1) : tag;
			const escapedCleanTag = cleanTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

			// 检查tags数组格式
			const tagsArrayRegex = new RegExp(`tags:\\s*\\[([^\\]]*${escapedCleanTag}[^\\]]*)\\]`, 'i');
			if (tagsArrayRegex.test(frontmatter)) {
				return true;
			}

			// 检查tags列表格式
			const tagsListRegex = new RegExp(`tags:([\\s\\S]*?${escapedCleanTag}[\\s\\S]*?)(?:\\n[^\\s]|$)`, 'i');
			if (tagsListRegex.test(frontmatter)) {
				return true;
			}
		}

		return false;
	}

	// 替换文件内容中的标签
	private replaceTag(content: string, oldTag: string, newTag: string): string {
		// 转义正则表达式中的特殊字符
		const escapedOldTag = oldTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

		// 处理正文中的标签
		const tagRegex = new RegExp(`${escapedOldTag}(?=[\\s,.]|$)`, 'g');
		let newContent = content.replace(tagRegex, newTag);

		// 处理YAML frontmatter中的标签
		const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
		const frontmatterMatch = newContent.match(frontmatterRegex);

		if (frontmatterMatch) {
			const frontmatter = frontmatterMatch[1];
			const cleanOldTag = oldTag.startsWith('#') ? oldTag.substring(1) : oldTag;
			const cleanNewTag = newTag.startsWith('#') ? newTag.substring(1) : newTag;
			const escapedCleanOldTag = cleanOldTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

			// 替换tags数组格式中的标签
			let newFrontmatter = frontmatter.replace(
				new RegExp(`(tags:\\s*\\[[^\\]]*?)${escapedCleanOldTag}([^\\]]*)\\]`, 'i'),
				`$1${cleanNewTag}$2]`
			);

			// 替换tags列表格式中的标签
			newFrontmatter = newFrontmatter.replace(
				new RegExp(`(tags:[\\s\\S]*?)-\\s*${escapedCleanOldTag}([\\s\\S]*?)(?:\\n[^\\s]|$)`, 'i'),
				`$1- ${cleanNewTag}$2\n`
			);

			if (newFrontmatter !== frontmatter) {
				newContent = newContent.replace(frontmatterMatch[1], newFrontmatter);
			}
		}

		return newContent;
	}

	// 从文件内容中移除标签
	private removeTag(content: string, tag: string): string {
		// 转义正则表达式中的特殊字符
		const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

		// 处理正文中的标签
		const tagRegex = new RegExp(`${escapedTag}(?=[\\s,.]|$)`, 'g');
		let newContent = content.replace(tagRegex, '');

		// 处理YAML frontmatter中的标签
		const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
		const frontmatterMatch = newContent.match(frontmatterRegex);

		if (frontmatterMatch) {
			const frontmatter = frontmatterMatch[1];
			const cleanTag = tag.startsWith('#') ? tag.substring(1) : tag;
			const escapedCleanTag = cleanTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

			// 处理tags数组格式
			let newFrontmatter = frontmatter;

			// 移除数组中的标签
			const arrayTagRegex = new RegExp(`(tags:\\s*\\[[^\\]]*?),?\\s*${escapedCleanTag}([^\\]]*)\\]`, 'i');
			newFrontmatter = newFrontmatter.replace(arrayTagRegex, '$1$2]');

			// 如果标签是数组中的第一个元素
			const firstArrayTagRegex = new RegExp(`(tags:\\s*\\[)\\s*${escapedCleanTag},?\\s*([^\\]]*)\\]`, 'i');
			newFrontmatter = newFrontmatter.replace(firstArrayTagRegex, '$1$2]');

			// 处理空数组
			newFrontmatter = newFrontmatter.replace(/tags:\s*\[\s*\]\s*\n?/g, '');

			// 处理列表格式的标签
			const listTagRegex = new RegExp(`(tags:[\\s\\S]*?)\\s*-\\s*${escapedCleanTag}\\s*\\n`, 'i');
			newFrontmatter = newFrontmatter.replace(listTagRegex, '$1');

			// 处理空列表
			newFrontmatter = newFrontmatter.replace(/tags:\s*\n(?!\s*-)/g, '');

			if (newFrontmatter !== frontmatter) {
				newContent = newContent.replace(frontmatterMatch[1], newFrontmatter);
			}
		}

		return newContent;
	}
	// 显示修改标签名称的弹窗
	showRenameTagModal(oldTag: string): void {
		const modal = new TagRenameModal(this.app, oldTag, async (newTag: string) => {
			if (newTag && newTag !== oldTag) {
				await this.renameTag(oldTag, newTag);
			}
		});
		modal.open();
	}
	
	// 添加文件到收藏夹
	async addToFavorites(filePath: string): Promise<boolean> {
		try {
			// 获取文件对象
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!file) {
				new Notice('文件不存在');
				return false;
			}

			// @ts-ignore - 访问内部 API
			const bookmarkManager = this.app.internalPlugins.plugins.bookmarks?.instance;
			if (bookmarkManager) {
				// 添加到收藏夹
				await bookmarkManager.addBookmark({
					type: 'file',
					path: filePath
				});
				new Notice('已添加到收藏夹');
				return true;
			} else {
				new Notice('收藏夹功能不可用');
				return false;
			}
		} catch (error) {
			console.error('添加收藏失败:', error);
			new Notice('添加收藏失败');
			return false;
		}
	}
	
	// 删除标签
	async deleteTag(tag: string): Promise<boolean> {
		try {
			// 确保标签格式正确
			if (!tag.startsWith('#')) tag = '#' + tag;

			// 获取所有包含该标签的文件
			const files = this.app.vault.getMarkdownFiles();
			let updatedCount = 0;

			for (const file of files) {
				const content = await this.app.vault.read(file);

				// 检查文件是否包含该标签
				if (this.fileContainsTag(content, tag)) {
					// 移除标签，确保不影响其他标签
					const newContent = this.removeTag(content, tag);

					// 如果内容有变化，则更新文件
					if (newContent !== content) {
						await this.app.vault.modify(file, newContent);
						updatedCount++;
					}
				}
			}

			new Notice(`已从 ${updatedCount} 个文件中移除标签 ${tag}`);

			// 刷新标签视图
			const tagView = this.getTagView();
			if (tagView) {
				await tagView.refreshView();
			}

			return true;
		} catch (error) {
			console.error('删除标签失败:', error);
			new Notice('删除标签失败');
			return false;
		}
	}
	
	
	// 添加文件到收藏夹
}
