import { ItemView, WorkspaceLeaf, TFile, getAllTags, Notice, Menu, MenuItem } from 'obsidian';
import TagManagerPlugin from './main';
import { DeleteTagModal } from './DeleteTagModal';
import { TagEditModal } from './TagEditModal';

export const VIEW_TYPE_TAG = 'tag-manager-view';

export class TagView extends ItemView {
    private plugin: TagManagerPlugin;
    private tagContainer: HTMLElement;
    private fileContainer: HTMLElement;
    private searchInput: HTMLInputElement;
    private tagMap: Map<string, TFile[]>;
    private currentTag: string | null = null;
    private resizer: HTMLElement;
    private tagSection: HTMLElement;
    private fileSection: HTMLElement;
    private hierarchicalTags: Map<string, Set<string>> = new Map(); // 存储父子标签关系
    private untaggedFiles: TFile[] = []; // 存储无标签的文件
    private selectedFiles: Set<TFile> = new Set(); // 存储多选的文件
    private lastSelectedFile: TFile | null = null; // 存储最后选择的文件，用于Shift多选
    private batchActionBar: HTMLElement; // 批量操作栏
    constructor(leaf: WorkspaceLeaf, plugin: TagManagerPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.tagMap = new Map();
    }

    getViewType(): string {
        return VIEW_TYPE_TAG;
    }

    getDisplayText(): string {
        return '标签管理器';
    }

    // 添加图标方法
    getIcon(): string {
        return 'tag';
    }

    async onOpen() {
        await this.initView();
        this.registerEvent(
            this.app.metadataCache.on('changed', () => this.refreshView())
        );
    }

    // 创建新文件的方法
    // 创建新文件的方法
    async createNewFileWithTag(tagName?: string) {
        const plugin = this.plugin as TagManagerPlugin;
        const defaultPath = plugin.getDefaultNewNotePath();

        // 使用传入的标签名或当前选中的标签
        const tag = tagName || this.currentTag;

        if (!tag) {
            new Notice('请先选择一个标签');
            return;
        }

        // 清理标签名，移除可能的 'parent-only:' 前缀
        let cleanTag = tag;
        if (cleanTag.startsWith('parent-only:')) {
            cleanTag = cleanTag.substring('parent-only:'.length);
        }

        // 生成文件名
        const now = new Date();
        const dateStr = now.getFullYear() +
            '-' + String(now.getMonth() + 1).padStart(2, '0') +
            '-' + String(now.getDate()).padStart(2, '0') +
            '-' + String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0');

        // 确保标签名中不包含文件系统不允许的字符
        const safeTag = cleanTag.replace(/[\\/:*?"<>|]/g, '-');
        const fileName = `${safeTag}-${dateStr}.md`;

        try {
            // 确保路径存在
            if (!defaultPath) {
                throw new Error('默认路径未设置');
            }

            // 组合完整路径，确保路径格式正确
            let filePath = '';
            if (defaultPath.endsWith('/') || defaultPath.endsWith('\\')) {
                filePath = `${defaultPath}${fileName}`;
            } else {
                filePath = `${defaultPath}/${fileName}`;
            }

            // 规范化路径分隔符
            filePath = filePath.replace(/\\/g, '/').replace(/\/\//g, '/');

            // 创建文件内容，包含标签
            // 确保标签格式正确，移除可能的 # 前缀
            const tagContent = cleanTag.startsWith('#') ? cleanTag.substring(1) : cleanTag;
            const fileContent = `---\ntags: [${tagContent}]\n---\n\n`;

            // 创建文件
            const file = await this.app.vault.create(filePath, fileContent);

            // 打开新创建的文件
            await this.app.workspace.getLeaf().openFile(file);

            new Notice(`已创建带标签 #${tagContent} 的文件`);

            // 刷新视图
            setTimeout(() => this.refreshView(), 500);
        } catch (error) {
            console.error('创建文件失败:', error);
            new Notice(`创建文件失败: ${error.message}`);
        }
    }

    // 添加文件到收藏夹
    async addFileToFavorites(filePath: string) {
        const plugin = this.plugin as TagManagerPlugin;
        await plugin.addToFavorites(filePath);
    }
    private async initView() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('tag-manager-container');

        // 创建搜索框
        this.createSearchBar(container);

        // 创建主容器
        const mainContainer = container.createDiv('tag-manager-main');

        // 创建标签列表
        this.tagSection = mainContainer.createDiv('tag-manager-tags');
        this.tagSection.style.width = `${this.plugin.settings.tagColumnWidth}px`;
        this.tagSection.style.minWidth = '180px';

        // 创建分隔线和拖动调整器
        this.resizer = mainContainer.createDiv('tag-manager-resizer');
        this.resizer.addEventListener('mousedown', this.initResize.bind(this));

        // 创建文件列表
        this.fileSection = mainContainer.createDiv('tag-manager-files');

        // 创建标签列表头部和内容
        this.createTagList(this.tagSection);

        // 创建文件列表头部和内容
        this.createFileList(this.fileSection);

        // 初始化数据
        await this.refreshView();
    }

    private initResize(e: MouseEvent) {
        e.preventDefault();
        
        const startX = e.pageX;
        const startWidth = this.tagSection.getBoundingClientRect().width;
        
        const mouseMoveHandler = (e: MouseEvent) => {
            const newWidth = startWidth + e.pageX - startX;
            if (newWidth >= 180) { // 最小宽度限制
                this.tagSection.style.width = `${newWidth}px`;
                this.plugin.settings.tagColumnWidth = newWidth;
            }
        };
        
        const mouseUpHandler = () => {
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
            this.plugin.saveSettings();
        };
        
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
    }

    private createTagList(container: HTMLElement) {
        const tagHeader = container.createDiv('tag-manager-header');
        
        // 添加标签列标题
        const titleEl = tagHeader.createEl('span', { text: '标签' });
        
        // 添加按钮容器
        const buttonContainer = tagHeader.createDiv('tag-header-buttons');
        
        // 添加折叠按钮
        const collapseButton = buttonContainer.createEl('button', {
            cls: 'tag-collapse-button',
            text: '折叠'
        });
        collapseButton.addEventListener('click', () => this.toggleAllTags());
        
        // 添加展开按钮
        const expandButton = buttonContainer.createEl('button', {
            cls: 'tag-expand-button',
            text: '展开'
        });
        expandButton.addEventListener('click', () => this.expandAllTags());

        this.tagContainer = container.createDiv('tag-list');
    }

    private createFileList(container: HTMLElement) {
        const fileHeader = container.createDiv('tag-manager-header');

        // 添加文件列标题
        //fileHeader.createEl('span', { text: '文件' });

        // 添加按钮容器
        const buttonContainer = fileHeader.createDiv('file-header-buttons');

        // 添加批量操作栏 - 初始隐藏
        //this.batchActionBar = buttonContainer.createDiv('batch-action-bar');
        //this.batchActionBar.style.display = 'none';

        // 添加已选择文件数量显示
        //const countSpan = this.batchActionBar.createSpan('selected-count');
       // countSpan.textContent = '已选择 0 个文件';

        // 添加按钮容器
        //const actionsContainer = this.batchActionBar.createDiv('batch-actions-buttons');

        // 添加批量修改标签按钮
        const batchEditTagsButton = buttonContainer.createEl('button', {
            cls: 'batch-edit-tags-button',
            text: '修改标签',
            attr: {
                'title': '批量修改选中文件的标签'
            }
        });

        batchEditTagsButton.addEventListener('click', () => {
            if (this.selectedFiles.size > 0) {
                this.showEditTagsModalForMultipleFiles(Array.from(this.selectedFiles));
            }
        });

       /*  // 添加取消选择按钮
        const clearSelectionButton = actionsContainer.createEl('button', {
            cls: 'clear-selection-button',
            text: '取消选择',
            attr: {
                'title': '取消所有选择'
            }
        }); */

        /* clearSelectionButton.addEventListener('click', () => {
            this.clearSelection();
        }); */
        // 修改新建文件按钮为纯文字
        const newFileButton = buttonContainer.createEl('button', {
            cls: 'file-new-button',
            text: '新建',
            attr: {
                'title': '新建文件（带当前标签）'
            }
        });
        
        newFileButton.addEventListener('click', () => {
            if (this.currentTag) {
                this.createNewFileWithTag();
            } else {
                new Notice('请先选择一个标签');
            }
        });
        
        // 添加排序按钮
        const sortButton = fileHeader.createEl('button', {
            cls: 'file-sort-button',
            text: '排序'
        });
        
        // 创建排序菜单
        sortButton.addEventListener('click', (e) => {
            const menu = new Menu();
            
            const sortOptions = [
                { value: 'mtime-desc', text: '修改时间 (新→旧)', icon: 'calendar-clock' },
                { value: 'mtime-asc', text: '修改时间 (旧→新)', icon: 'calendar-clock' },
                { value: 'ctime-desc', text: '创建时间 (新→旧)', icon: 'calendar-plus' },
                { value: 'ctime-asc', text: '创建时间 (旧→新)', icon: 'calendar-plus' },
                { value: 'name-asc', text: '名称 (A→Z)', icon: 'sort-alphabetical-ascending' },
                { value: 'name-desc', text: '名称 (Z→A)', icon: 'sort-alphabetical-descending' },
                { value: 'size-desc', text: '文件大小 (大→小)', icon: 'file-volume' },
                { value: 'size-asc', text: '文件大小 (小→大)', icon: 'file-volume' },
                { value: 'path-asc', text: '文件路径 (A→Z)', icon: 'folder' },
                { value: 'path-desc', text: '文件路径 (Z→A)', icon: 'folder' }
            ];
            
            sortOptions.forEach(option => {
                menu.addItem((item: MenuItem) => {
                    item.setTitle(option.text)
                        .setIcon(option.icon)
                        .onClick(() => {
                            this.sortFiles(option.value);
                        });
                });
            });
            
            menu.showAtPosition({ x: e.pageX, y: e.pageY });
        });

        this.fileContainer = container.createDiv('file-list');
    }

    private async updateTagMap() {
        this.tagMap.clear();
        this.hierarchicalTags.clear();
        this.untaggedFiles = []; // 清空无标签文件列表
        const files = this.app.vault.getMarkdownFiles();

        for (const file of files) {
            if (this.shouldIgnoreFile(file)) continue;

            const cache = this.app.metadataCache.getFileCache(file);
            const tags = cache ? getAllTags(cache) || [] : [];

            // 如果文件没有标签，添加到无标签文件列表
            if (tags.length === 0) {
                this.untaggedFiles.push(file);
                continue;
            }

            for (const tag of tags) {
                if (this.shouldIgnoreTag(tag)) continue;

                const cleanTag = tag.substring(1); // 移除 # 符号

                // 处理层级标签
                const tagParts = cleanTag.split('/');
                let currentPath = '';

                for (let i = 0; i < tagParts.length; i++) {
                    const part = tagParts[i];
                    const parentPath = currentPath;

                    currentPath = currentPath ? `${currentPath}/${part}` : part;

                    // 添加到标签映射
                    if (!this.tagMap.has(currentPath)) {
                        this.tagMap.set(currentPath, []);
                    }

                    // 只有最后一级标签才关联文件
                    if (i === tagParts.length - 1) {
                        this.tagMap.get(currentPath)?.push(file);
                    }

                    // 建立父子关系
                    if (parentPath) {
                        if (!this.hierarchicalTags.has(parentPath)) {
                            this.hierarchicalTags.set(parentPath, new Set());
                        }
                        this.hierarchicalTags.get(parentPath)?.add(currentPath);
                    }
                }
            }
        }
    }
    private renderTags() {
        this.tagContainer.empty();

        // 添加"无标签"选项
        this.renderUntaggedOption();

        // 获取顶级标签（没有父标签的标签）
        const topLevelTags = Array.from(this.tagMap.keys())
            .filter(tag => !tag.includes('/'))
            .sort((a, b) => {
                const aFiles = this.getTagTotalFiles(a);
                const bFiles = this.getTagTotalFiles(b);
                return bFiles - aFiles;
            });

        // 渲染顶级标签
        for (const tag of topLevelTags) {
            this.renderTagItem(tag, this.tagContainer, 0);
        }

        // 修改默认选中逻辑：优先选择标签而不是"无标签"选项
        if (!this.currentTag) {
            // 如果有标签，选择第一个标签
            if (topLevelTags.length > 0) {
                const firstTagEl = this.tagContainer.querySelector('.tag-item:not(.untagged-item)');
                if (firstTagEl) {
                    firstTagEl.addClass('selected');
                    this.currentTag = topLevelTags[0];
                    this.renderFiles(this.currentTag);
                }
            }
            // 只有在没有标签的情况下才默认选择"无标签"选项
            else {
                const untaggedEl = this.tagContainer.querySelector('.untagged-item');
                if (untaggedEl) {
                    untaggedEl.addClass('selected');
                    this.currentTag = null;
                    this.renderUntaggedFiles();
                }
            }
        }
    }
    // 渲染"无标签"选项
    private renderUntaggedOption() {
        const untaggedEl = this.tagContainer.createDiv({ cls: 'tag-item untagged-item' });

        // 创建标签折叠按钮占位
        const toggleEl = untaggedEl.createDiv('tag-toggle no-children');
        if (!this.plugin.settings.showTagToggleTriangle) {
            toggleEl.addClass('hidden');
        }

        // 创建标签图标
        const tagIconEl = untaggedEl.createDiv('tag-icon');
        tagIconEl.setText('📝');  // 使用笔记emoji

        // 创建标签名称和文件数量
        const tagNameEl = untaggedEl.createDiv('tag-name');
        tagNameEl.setText(`无标签 (${this.untaggedFiles.length})`);
        tagNameEl.setAttribute('title', `没有任何标签的笔记: ${this.untaggedFiles.length}`);

        // 点击显示无标签文件
        untaggedEl.addEventListener('click', () => {
            this.currentTag = null;
            this.renderUntaggedFiles();

            // 移除其他标签的选中状态
            this.tagContainer.querySelectorAll('.tag-item').forEach(el => {
                el.removeClass('selected');
            });
            untaggedEl.addClass('selected');
        });
    }

    // 获取标签及其子标签的总文件数
    private getTagTotalFiles(tag: string): number {
        let count = this.tagMap.get(tag)?.length || 0;
        
        // 添加子标签的文件数
        const children = this.hierarchicalTags.get(tag);
        if (children) {
            for (const child of children) {
                count += this.getTagTotalFiles(child);
            }
        }
        
        return count;
    }

    // 渲染标签项（递归渲染子标签）
    private renderTagItem(tag: string, container: HTMLElement, level: number) {
        const tagEl = container.createDiv({ cls: 'tag-item' });
        // 减少缩进，从20px改为15px
        tagEl.style.paddingLeft = `${level * 15 + 8}px`;

        // 如果启用彩虹大纲，添加彩虹大纲类和层级类
        if (this.plugin.settings.enableRainbowOutline) {
            tagEl.addClass('rainbow-outline');
            tagEl.addClass(`level-${level % 7}`); // 使用7种颜色循环
        }

        // 获取标签名（不含路径）
        const tagName = tag.includes('/') ? tag.split('/').pop() || tag : tag;

        // 创建标签折叠按钮
        const toggleEl = tagEl.createDiv('tag-toggle');

        // 检查是否有子标签
        const hasChildren = this.hierarchicalTags.has(tag) &&
            (this.hierarchicalTags.get(tag)?.size ?? 0) > 0;

        // 根据设置决定是否显示三角形
        if (!this.plugin.settings.showTagToggleTriangle) {
            toggleEl.addClass('hidden');
        }

        if (hasChildren) {
            toggleEl.innerHTML = '▼';
            toggleEl.addClass('has-children');
        } else {
            toggleEl.addClass('no-children');
        }

        toggleEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (hasChildren) {
                this.toggleTag(tagEl, tag);
            }
        });

        // 创建标签图标
        const tagIconEl = tagEl.createDiv('tag-icon');
        tagIconEl.setText('🏷️');  // 使用标签emoji
        // 修改为弹出菜单而不是直接调用重命名
        tagIconEl.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止事件冒泡，避免触发标签选择

            // 创建菜单
            const menu = new Menu();

            // 添加重命名选项
            menu.addItem(item => {
                item.setTitle('重命名标签')
                    .setIcon('pencil')
                    .onClick(() => {
                        this.plugin.showRenameTagModal(tag);
                    });
            });

            // 添加删除选项
            menu.addItem(item => {
                item.setTitle('删除标签')
                    .setIcon('trash')
                    .onClick(() => {
                        this.showDeleteTagConfirmation(tag);
                    });
            });

            // 显示菜单
            menu.showAtPosition({ x: e.pageX, y: e.pageY });
        });
        // 创建标签名称和文件数量
        const tagNameEl = tagEl.createDiv('tag-name');
        const totalFiles = this.getTagTotalFiles(tag);
        const directFiles = this.tagMap.get(tag)?.length || 0;

        tagNameEl.setText(`${tagName} (${directFiles}/${totalFiles})`);
        tagNameEl.setAttribute('title', `${tagName} (直接文件: ${directFiles}, 总文件: ${totalFiles})`);

        // 点击标签显示相关文件 - 修复这里确保显示所有子标签文件
        tagEl.addEventListener('click', () => {
            this.currentTag = tag;
            // 确保调用 renderFiles 方法来显示包括子标签在内的所有文件
            this.renderFiles(tag);

            // 移除其他标签的选中状态
            this.tagContainer.querySelectorAll('.tag-item').forEach(el => {
                el.removeClass('selected');
            });
            tagEl.addClass('selected');
        });

        // 渲染子标签
        if (hasChildren) {
            const childContainer = container.createDiv({ cls: 'tag-children' });
            childContainer.dataset.parent = tag;

            // 如果有直接使用父标签的文件，添加"仅父标签"选项
            if (directFiles > 0) {
                this.renderParentOnlyOption(tag, childContainer, level + 1);
            }

            // 按文件数量排序子标签
            const children = Array.from(this.hierarchicalTags.get(tag) || [])
                .sort((a, b) => {
                    const aFiles = this.getTagTotalFiles(a);
                    const bFiles = this.getTagTotalFiles(b);
                    return bFiles - aFiles;
                });

            for (const child of children) {
                this.renderTagItem(child, childContainer, level + 1);
            }
        }
    }
    // 渲染"仅父标签"选项
    private renderParentOnlyOption(parentTag: string, container: HTMLElement, level: number) {
        const parentOnlyEl = container.createDiv({ cls: 'tag-item parent-only-item' });
        parentOnlyEl.style.paddingLeft = `${level * 15 + 8}px`;

        // 如果启用彩虹大纲，添加彩虹大纲类和层级类
        if (this.plugin.settings.enableRainbowOutline) {
            parentOnlyEl.addClass('rainbow-outline');
            parentOnlyEl.addClass(`level-${level % 7}`); // 使用7种颜色循环
        }

        // 创建标签折叠按钮占位
        const toggleEl = parentOnlyEl.createDiv('tag-toggle no-children');
        if (!this.plugin.settings.showTagToggleTriangle) {
            toggleEl.addClass('hidden');
        }

        // 创建标签图标
        const tagIconEl = parentOnlyEl.createDiv('tag-icon');
        tagIconEl.setText('📎');  // 使用回形针emoji

        // 获取标签名（不含路径）
        const tagName = parentTag.includes('/') ? parentTag.split('/').pop() || parentTag : parentTag;

        // 创建标签名称和文件数量
        const tagNameEl = parentOnlyEl.createDiv('tag-name');
        const directFiles = this.tagMap.get(parentTag)?.length || 0;

        tagNameEl.setText(`${tagName} (${directFiles})`);
        tagNameEl.setAttribute('title', `仅使用 ${tagName} 标签的文件: ${directFiles}`);

        // 点击显示仅父标签文件
        parentOnlyEl.addEventListener('click', () => {
            this.currentTag = `parent-only:${parentTag}`;
            this.renderParentOnlyFiles(parentTag);

            // 移除其他标签的选中状态
            this.tagContainer.querySelectorAll('.tag-item').forEach(el => {
                el.removeClass('selected');
            });
            parentOnlyEl.addClass('selected');
        });
    }

    // 渲染无标签文件
    private renderUntaggedFiles() {
        this.fileContainer.empty();

        if (this.untaggedFiles.length === 0) {
            this.fileContainer.createDiv('empty-message').setText('没有无标签的文件');
            return;
        }

        // 默认按修改时间排序，最新的在上面
        this.sortFiles('mtime-desc', this.untaggedFiles);
    }

    // 渲染仅父标签文件
    private renderParentOnlyFiles(parentTag: string) {
        this.fileContainer.empty();

        const files = this.tagMap.get(parentTag) || [];
        if (files.length === 0) {
            this.fileContainer.createDiv('empty-message').setText('没有仅使用此标签的文件');
            return;
        }

        // 默认按修改时间排序，最新的在上面
        this.sortFiles('mtime-desc', files);
    }

    private renderFiles(tag: string) {
        this.fileContainer.empty();

        // 处理特殊标签
        if (tag === null) {
            this.renderUntaggedFiles();
            return;
        }

        if (tag.startsWith('parent-only:')) {
            const parentTag = tag.substring('parent-only:'.length);
            this.renderParentOnlyFiles(parentTag);
            return;
        }

        // 收集当前标签及其所有子标签的文件
        const allFiles = this.collectFilesForTagAndChildren(tag);

        if (allFiles.length === 0) {
            this.fileContainer.createDiv('empty-message').setText('没有文件');
            return;
        }

        // 默认按修改时间排序，最新的在上面
        this.sortFiles('mtime-desc', allFiles);
    }
    // 收集标签及其所有子标签的文件
    private collectFilesForTagAndChildren(tag: string): TFile[] {
        // 使用 Set 避免文件重复
        const fileSet = new Set<TFile>();

        // 添加当前标签的文件
        const currentTagFiles = this.tagMap.get(tag) || [];
        currentTagFiles.forEach(file => fileSet.add(file));

        // 递归添加所有子标签的文件
        this.addChildTagFiles(tag, fileSet);

        return Array.from(fileSet);
    }

    // 递归添加子标签的文件
    private addChildTagFiles(parentTag: string, fileSet: Set<TFile>): void {
        const children = this.hierarchicalTags.get(parentTag);
        if (!children) return;

        for (const childTag of children) {
            // 添加子标签的文件
            const childFiles = this.tagMap.get(childTag) || [];
            childFiles.forEach(file => fileSet.add(file));

            // 递归处理子标签的子标签
            this.addChildTagFiles(childTag, fileSet);
        }
    }
    // 显示删除标签确认弹窗
    private showDeleteTagConfirmation(tag: string): void {
        const modal = new DeleteTagModal(this.app, tag, async (confirmed: boolean) => {
            if (confirmed) {
                // 执行删除标签操作
                const success = await this.plugin.deleteTag(tag);
                if (success) {
                    // 如果当前选中的是被删除的标签，清除选择
                    if (this.currentTag === tag) {
                        this.currentTag = null;
                    }
                    // 刷新视图
                    await this.refreshView();
                }
            }
        });
        modal.open();
    }
    private toggleTag(tagEl: HTMLElement, tag: string) {
        const toggleEl = tagEl.querySelector('.tag-toggle');
        const childContainer = this.tagContainer.querySelector(`.tag-children[data-parent="${tag}"]`);
        
        if (toggleEl && childContainer) {
            if (toggleEl.innerHTML === '▼') {
                toggleEl.innerHTML = '▶';
                (childContainer as HTMLElement).style.display = 'none';
            } else {
                toggleEl.innerHTML = '▼';
                (childContainer as HTMLElement).style.display = 'block';
            }
        }
    }

    private toggleAllTags() {
        // 折叠所有标签
        this.tagContainer.querySelectorAll('.tag-toggle.has-children').forEach(toggle => {
            toggle.innerHTML = '▶';
        });
        
        this.tagContainer.querySelectorAll('.tag-children').forEach(child => {
            (child as HTMLElement).style.display = 'none';
        });
    }

    private expandAllTags() {
        // 展开所有标签
        this.tagContainer.querySelectorAll('.tag-toggle.has-children').forEach(toggle => {
            toggle.innerHTML = '▼';
        });
        
        this.tagContainer.querySelectorAll('.tag-children').forEach(child => {
            (child as HTMLElement).style.display = 'block';
        });
    }

   
    private sortFiles(sortOption: string, files?: TFile[]) {
        let filesToSort: TFile[] = [];

        // 如果提供了文件数组，使用提供的数组
        if (files && files.length > 0) {
            filesToSort = files;
        }
        // 否则，根据当前标签状态获取相应文件
        else if (this.currentTag === null) {
            // 无标签文件
            filesToSort = this.untaggedFiles;
        } else if (this.currentTag.startsWith('parent-only:')) {
            // 仅父标签文件
            const parentTag = this.currentTag.substring('parent-only:'.length);
            filesToSort = this.tagMap.get(parentTag) || [];
        } else {
            // 普通标签文件（包括子标签）
            filesToSort = this.collectFilesForTagAndChildren(this.currentTag);
        }

        if (filesToSort.length === 0) {
            this.fileContainer.createDiv('empty-message').setText('没有文件');
            return;
        }

        let sortedFiles: TFile[] = [];

        switch (sortOption) {
            case 'mtime-desc':
                sortedFiles = filesToSort.sort((a, b) => b.stat.mtime - a.stat.mtime);
                break;
            case 'mtime-asc':
                sortedFiles = filesToSort.sort((a, b) => a.stat.mtime - b.stat.mtime);
                break;
            case 'ctime-desc':
                sortedFiles = filesToSort.sort((a, b) => b.stat.ctime - a.stat.ctime);
                break;
            case 'ctime-asc':
                sortedFiles = filesToSort.sort((a, b) => a.stat.ctime - b.stat.ctime);
                break;
            case 'name-asc':
                sortedFiles = filesToSort.sort((a, b) => a.basename.localeCompare(b.basename));
                break;
            case 'name-desc':
                sortedFiles = filesToSort.sort((a, b) => b.basename.localeCompare(a.basename));
                break;
            case 'size-desc':
                sortedFiles = filesToSort.sort((a, b) => b.stat.size - a.stat.size);
                break;
            case 'size-asc':
                sortedFiles = filesToSort.sort((a, b) => a.stat.size - b.stat.size);
                break;
            case 'path-asc':
                sortedFiles = filesToSort.sort((a, b) => a.path.localeCompare(b.path));
                break;
            case 'path-desc':
                sortedFiles = filesToSort.sort((a, b) => b.path.localeCompare(a.path));
                break;
            default:
                // 默认也使用修改时间降序排序
                sortedFiles = filesToSort.sort((a, b) => b.stat.mtime - a.stat.mtime);
        }

        this.fileContainer.empty();
        
        // 存储视图中文件的顺序，用于Shift多选
        const viewFiles: TFile[] = [];

        for (const file of sortedFiles) {
            viewFiles.push(file);
            const fileEl = this.fileContainer.createDiv('file-item');

            // 添加多选支持：如果文件已被选中，添加选中样式
            if (this.selectedFiles.has(file)) {
                fileEl.addClass('selected');
            }

            // 修复文件图标显示问题
            const fileIconEl = fileEl.createDiv('file-icon');
            // 使用文本图标而不是SVG
            fileIconEl.setText('📄');

            // 创建文件信息容器
            const fileInfoEl = fileEl.createDiv('file-info');

            // 添加文件名
            const nameEl = fileInfoEl.createDiv('file-name');
            nameEl.setText(file.basename);
            nameEl.setAttribute('title', file.basename);

            // 添加文件路径
            const pathEl = fileInfoEl.createDiv('file-path');
            // 获取相对路径（不包含文件名）
            const relativePath = file.path.substring(0, file.path.lastIndexOf('/'));
            pathEl.setText(relativePath || '根目录');
            pathEl.setAttribute('title', relativePath || '根目录');

            // 修改点击事件，支持Ctrl多选和Shift范围选择
            fileEl.addEventListener('click', (e) => {
                if (e.ctrlKey) {
                    // Ctrl+点击实现多选
                    if (this.selectedFiles.has(file)) {
                        this.selectedFiles.delete(file);
                        fileEl.removeClass('selected');
                    } else {
                        this.selectedFiles.add(file);
                        fileEl.addClass('selected');
                        this.lastSelectedFile = file;
                    }
                } else if (e.shiftKey && this.lastSelectedFile) {
                    // Shift+点击实现范围选择
                    const lastIndex = viewFiles.indexOf(this.lastSelectedFile);
                    const currentIndex = viewFiles.indexOf(file);

                    if (lastIndex !== -1 && currentIndex !== -1) {
                        // 确定范围的起始和结束索引
                        const startIndex = Math.min(lastIndex, currentIndex);
                        const endIndex = Math.max(lastIndex, currentIndex);

                        // 选择范围内的所有文件
                        for (let i = startIndex; i <= endIndex; i++) {
                            this.selectedFiles.add(viewFiles[i]);
                        }

                        // 更新UI显示
                        this.fileContainer.querySelectorAll('.file-item').forEach((el, idx) => {
                            if (idx >= startIndex && idx <= endIndex) {
                                el.addClass('selected');
                            }
                        });
                    }
                } else {
                    // 普通点击，清除其他选择，只选当前文件
                    this.selectedFiles.clear();
                    this.fileContainer.querySelectorAll('.file-item').forEach(el => {
                        el.removeClass('selected');
                    });
                    this.selectedFiles.add(file);
                    fileEl.addClass('selected');
                    this.lastSelectedFile = file;

                    // 打开文件
                    this.app.workspace.getLeaf().openFile(file);
                }

                // 更新批量操作栏
                this.updateBatchActionBar();
            });

            // 右键菜单
            fileEl.addEventListener('contextmenu', (e) => {
                // 如果右键点击的文件不在已选文件中，则清除选择并选中当前文件
                if (!this.selectedFiles.has(file)) {
                    this.selectedFiles.clear();
                    this.fileContainer.querySelectorAll('.file-item').forEach(el => {
                        el.removeClass('selected');
                    });
                    this.selectedFiles.add(file);
                    fileEl.addClass('selected');
                    this.lastSelectedFile = file;
                }

                e.preventDefault();
                this.showFileContextMenu(file, e);

                // 更新批量操作栏
                this.updateBatchActionBar();
            });
        }
    }
    private showFileContextMenu(file: TFile, event: MouseEvent) {
        const menu = new Menu();
        
        menu.addItem((item: MenuItem) => {
            item.setTitle('打开文件')
                .setIcon('document')
                .onClick(() => {
                    this.app.workspace.getLeaf().openFile(file);
                });
        });
        // 添加修改标签选项
        menu.addItem(item => {
            item.setTitle("修改标签")
                .setIcon("tag")
                .onClick(() => {
                    this.showEditTagsModal(file);
                });
        });
        menu.addItem((item: MenuItem) => {
            item.setTitle('在新标签页打开')
                .setIcon('lucide-file-plus')
                .onClick(() => {
                    this.app.workspace.getLeaf('tab').openFile(file);
                });
        });
        
        if (this.currentTag) {
            menu.addSeparator();
            
            menu.addItem((item: MenuItem) => {
                item.setTitle('新建文件（带当前标签）')
                    .setIcon('lucide-file-plus')
                    .onClick(() => {
                    this.createNewFileWithTag();
                });
            });
        }
        // 新增：在新标签组打开
        menu.addItem(item => {
            item.setTitle("在新标签组打开")
                .setIcon("split")
                .onClick(() => {
                    this.app.workspace.getLeaf('split').openFile(file);
                });
        });

        // 新增：在新窗口打开
        menu.addItem(item => {
            item.setTitle("在新窗口打开")
                .setIcon("lucide-file-plus")
                .onClick(() => {
                    this.app.workspace.getLeaf('window').openFile(file);
                });
        });

        // 新增：创建副本
        menu.addItem(item => {
            item.setTitle("创建副本")
                .setIcon("copy")
                .onClick(async () => {
                    try {
                        const folder = file.parent;
                        if (!folder) {
                            throw new Error("无法获取文件所在文件夹");
                        }

                        const baseName = file.basename;
                        const ext = file.extension;

                        // 生成新文件名
                        let newName = `${baseName} 副本`;
                        let index = 1;
                        while (this.app.vault.getAbstractFileByPath(`${folder.path}/${newName}.${ext}`)) {
                            newName = `${baseName} 副本 ${index}`;
                            index++;
                        }

                        // 读取原文件内容并创建副本
                        const content = await this.app.vault.read(file);
                        const newFile = await this.app.vault.create(
                            `${folder.path}/${newName}.${ext}`,
                            content
                        );

                        new Notice(`已创建文件副本: ${newName}.${ext}`);
                    } catch (error) {
                        new Notice(`创建副本失败: ${error.message}`);
                    }
                });
        });

        // 修改：导出PDF（如果安装了Better Export PDF插件）
        if ((this.app as any).plugins.plugins["better-export-pdf"]) {
            menu.addItem(item => {
                item.setTitle("导出为PDF")
                    .setIcon('document')
                    .onClick(async () => {
                        try {
                            // 先打开文件
                            await this.app.workspace.getLeaf().openFile(file);
                            // 执行导出命令
                            await (this.app as any).commands.executeCommandById('better-export-pdf:export-current-file-to-pdf');
                            new Notice(`正在导出 ${file.name} 为PDF`);
                        } catch (error) {
                            new Notice(`导出PDF失败: ${error.message}`);
                            console.error("导出PDF错误:", error);
                        }
                    });
            });
        }

        // 添加文件恢复选项
        menu.addItem(item => {
            item.setTitle("查看文件历史")
                .setIcon("copy")
                .onClick(async () => {
                    try {
                        // 修改：使用类型断言访问内部 API
                        await (this.app as any).commands.executeCommandById('file-recovery:open-recovery-folder');

                        // 打开当前文件的恢复面板
                        setTimeout(async () => {
                            await (this.app as any).commands.executeCommandById('file-recovery:recover-file');
                        }, 100);

                        new Notice(`正在加载 ${file.name} 的历史版本`);
                    } catch (error) {
                        new Notice(`加载文件历史失败: ${error.message}`);
                        console.error("加载文件历史错误:", error);
                    }
                });
        });
        menu.addItem(item => {
            item.setTitle("移动文件(命令)")
                .setIcon("split")
                .onClick(async () => {
                    await (this.app as any).commands.executeCommandById('file-explorer:move-file');
                });
        });
        // 新增：打开为思维导图选项（如果安装了 Mindmap NextGen 插件）
        if ((this.app as any).plugins.plugins["obsidian-mindmap-nextgen"]) {
            menu.addItem(item => {
                item.setTitle("打开为思维导图")
                    .setIcon("git-branch")
                    .onClick(async () => {
                        try {
                            // 先打开文件
                            await this.app.workspace.getLeaf().openFile(file);
                            // 执行思维导图命令
                            await (this.app as any).commands.executeCommandById('obsidian-mindmap-nextgen:mindmapnextgen:unpinned');
                        } catch (error) {
                            new Notice(`打开思维导图失败: ${error.message}`);
                            console.error("打开思维导图错误:", error);
                        }
                    });
            });
        }
        // 新增：复制为 HTML
        if ((this.app as any).plugins.plugins["copy-document-as-html"]) {
            menu.addItem(item => {
                item.setTitle("复制为 HTML")
                    .setIcon("copy")
                    .onClick(async () => {
                        try {
                            // 先打开文件
                            await this.app.workspace.getLeaf().openFile(file);
                            // 执行复制命令
                            await (this.app as any).commands.executeCommandById('copy-document-as-html:copy-as-html');
                            new Notice(`已复制 ${file.name} 为 HTML`);
                        } catch (error) {
                            new Notice(`复制为 HTML 失败: ${error.message}`);
                            console.error("复制为 HTML 错误:", error);
                        }
                    });
            });
        }
        // 新增：在 HoverEditor 中打开
        if ((this.app as any).plugins.plugins["obsidian-hover-editor"]) {
            menu.addItem(item => {
                item.setTitle("打开 hover")
                    .setIcon("copy")
                    .onClick(async () => {
                        try {
                            await (this.app as any).commands.executeCommandById('obsidian-hover-editor:open-current-file-in-new-popover');
                        } catch (error) {
                            new Notice(`打开 hover 失败: ${error.message}`);
                            console.error("打开 hover 错误:", error);
                        }
                    });
            });
        }
        // 修改：收藏选项
        menu.addItem(item => {
            const isBookmarked = this.isFileBookmarked(file);
            item.setTitle(isBookmarked ? "取消收藏" : "收藏")
                .setIcon(isBookmarked ? "star-off" : "star")
                .onClick(() => {
                    this.toggleBookmark(file);
                });
        });

        // 添加在系统资源管理器中打开的选项
        menu.addItem(item => {
            item.setTitle("在系统资源管理器中打开")
                .setIcon("folder-open") // 确保使用正确的图标名称
                .onClick(() => {
                    this.openInSystemExplorer(file.path);
                });
        });


        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }
    // 新增：为多个文件显示标签编辑弹窗
    private async showEditTagsModalForMultipleFiles(files: TFile[]) {
        try {
            // 收集所有文件的标签
            const allFileTags = new Set<string>();
            const commonTags = new Set<string>();
            let isFirst = true;

            for (const file of files) {
                const cache = this.app.metadataCache.getFileCache(file);
                const fileTags = cache ? getAllTags(cache) || [] : [];
                const cleanTags = fileTags.map(tag => tag.substring(1)); // 移除 # 前缀

                // 对于第一个文件，所有标签都是"共同标签"
                if (isFirst && cleanTags.length > 0) {
                    cleanTags.forEach(tag => commonTags.add(tag));
                    isFirst = false;
                } else if (!isFirst) {
                    // 对于后续文件，只保留与之前文件共有的标签
                    const currentTagSet = new Set(cleanTags);
                    for (const tag of commonTags) {
                        if (!currentTagSet.has(tag)) {
                            commonTags.delete(tag);
                        }
                    }
                }

                // 收集所有标签
                cleanTags.forEach(tag => allFileTags.add(tag));
            }

            // 创建标签编辑弹窗
            const modal = new TagEditModal(
                this.app,
                files,
                Array.from(commonTags), // 所有文件共有的标签
                Array.from(this.tagMap.keys()), // 所有可用标签
                Array.from(allFileTags), // 所有文件的标签集合
                async () => {
                    // 刷新视图回调
                    await this.refreshView();
                }
            );

            modal.open();
        } catch (error) {
            console.error("打开多文件标签编辑弹窗失败:", error);
            new Notice(`无法编辑标签: ${error.message}`);
        }
    }

    // 清除所有选择
    private clearSelection() {
        this.selectedFiles.clear();
        this.lastSelectedFile = null;
        this.fileContainer.querySelectorAll('.file-item').forEach(el => {
            el.removeClass('selected');
        });
        this.updateBatchActionBar();
    }


    // 更新批量操作栏显示状态
    // 更新批量操作栏显示状态
    private updateBatchActionBar() {
        if (this.selectedFiles.size > 1) {
            this.batchActionBar.style.display = 'flex';
            // 更新选中数量显示
            const countEl = this.batchActionBar.querySelector('.selected-count');
            if (countEl) {
                countEl.textContent = `${this.selectedFiles.size} 个`;
            }
        } else {
            this.batchActionBar.style.display = 'none';
        }
    }
       // 修改单文件标签编辑弹窗方法
    private async showEditTagsModal(file: TFile) {
        try {
            // 获取文件当前的标签
            const cache = this.app.metadataCache.getFileCache(file);
            const currentTags = cache ? getAllTags(cache) || [] : [];

            // 创建标签编辑弹窗
            const modal = new TagEditModal(
                this.app,
                [file], // 修改为数组
                currentTags.map(tag => tag.substring(1)), // 移除 # 前缀
                Array.from(this.tagMap.keys()), // 所有可用标签
                currentTags.map(tag => tag.substring(1)), // 当前文件的所有标签
                async () => {
                    // 刷新视图回调
                    await this.refreshView();
                }
            );

            modal.open();
        } catch (error) {
            console.error("打开标签编辑弹窗失败:", error);
            new Notice(`无法编辑标签: ${error.message}`);
        }
    }
    // 添加公开的刷新方法供外部调用
    public async refreshViewPublic() {
        await this.refreshView();
    }
    public async refreshView() {
        // 保存当前选中的标签
        const previousTag = this.currentTag;

        await this.updateTagMap();
        this.renderTags();

        // 恢复之前选中的标签
        if (previousTag) {
            // 如果是特殊标签（无标签或仅父标签）
            if (previousTag === null) {
                this.renderUntaggedFiles();
                // 选中"无标签"选项
                const untaggedEl = this.tagContainer.querySelector('.untagged-item');
                if (untaggedEl) {
                    untaggedEl.addClass('selected');
                }
            } else if (previousTag.startsWith('parent-only:')) {
                const parentTag = previousTag.substring('parent-only:'.length);
                this.renderParentOnlyFiles(parentTag);

                // 查找并选中对应的"仅父标签"选项
                const parentOnlySelector = `.tag-children[data-parent="${parentTag}"] .parent-only-item`;
                const parentOnlyEl = this.tagContainer.querySelector(parentOnlySelector);
                if (parentOnlyEl) {
                    parentOnlyEl.addClass('selected');
                }
                this.currentTag = previousTag; // 恢复当前标签
            } else {
                // 普通标签
                this.renderFiles(previousTag);

                // 查找并选中对应的标签项
                const tagItems = this.tagContainer.querySelectorAll('.tag-item');
                for (const item of Array.from(tagItems)) {
                    const tagNameEl = item.querySelector('.tag-name');
                    if (tagNameEl) {
                        const tagText = tagNameEl.textContent || '';
                        // 提取标签名称（不含文件数量）
                        const tagName = tagText.split(' (')[0];
                        // 获取完整路径
                        const fullPath = this.getTagFullPath(item as HTMLElement);

                        if (fullPath === previousTag) {
                            item.addClass('selected');

                            // 确保父标签容器是展开的
                            this.ensureTagVisible(item as HTMLElement);
                            break;
                        }
                    }
                }
                this.currentTag = previousTag; // 恢复当前标签
            }
        } else if (this.currentTag === null) {
            // 如果是无标签状态，显示无标签文件
            this.renderUntaggedFiles();
            // 选中"无标签"选项
            const untaggedEl = this.tagContainer.querySelector('.untagged-item');
            if (untaggedEl) {
                untaggedEl.addClass('selected');
            }
        }
    }
    // 获取标签项的完整路径
    private getTagFullPath(tagEl: HTMLElement): string {
        // 检查是否是"仅父标签"项
        if (tagEl.classList.contains('parent-only-item')) {
            const parentContainer = tagEl.closest('.tag-children') as HTMLElement;
            if (parentContainer && parentContainer.dataset.parent) {
                return `parent-only:${parentContainer.dataset.parent}`;
            }
            return '';
        }

        // 获取标签名（不含文件数量）
        const tagNameEl = tagEl.querySelector('.tag-name');
        if (!tagNameEl) return '';

        const tagText = tagNameEl.textContent || '';
        const tagName = tagText.split(' (')[0];

        // 如果是顶级标签，直接返回标签名
        if (!tagEl.closest('.tag-children')) {
            return tagName;
        }

        // 递归获取父标签路径
        let path = tagName;
        let parent = tagEl.closest('.tag-children') as HTMLElement;

        while (parent) {
            if (parent.dataset.parent) {
                path = `${parent.dataset.parent}/${path}`;
            }

            // 继续向上查找
            parent = parent.parentElement?.closest('.tag-children') as HTMLElement;
        }

        return path;
    }

    // 确保标签在视图中可见（展开所有父标签）
    private ensureTagVisible(tagEl: HTMLElement) {
        let parent = tagEl.closest('.tag-children') as HTMLElement;

        while (parent) {
            // 显示当前容器
            parent.style.display = 'block';

            // 更新父标签的折叠图标
            const parentTagEl = parent.previousElementSibling as HTMLElement;
            if (parentTagEl && parentTagEl.classList.contains('tag-item')) {
                const toggleEl = parentTagEl.querySelector('.tag-toggle');
                if (toggleEl) {
                    toggleEl.innerHTML = '▼';
                }
            }

            // 继续向上查找
            parent = parent.parentElement?.closest('.tag-children') as HTMLElement;
        }
    }
    private createSearchBar(container: HTMLElement) {
        const searchContainer = container.createDiv('tag-manager-search');
        this.searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: '搜索标签或文件...'
        });
        this.searchInput.addEventListener('input', () => {
            this.handleSearch(this.searchInput.value);
        });
    }

    private shouldIgnoreFile(file: TFile): boolean {
        const filePath = file.path;
        // 检查是否在忽略文件夹中
        return this.plugin.settings.ignoreFolders.some(folder => {
            try {
                const regex = new RegExp(folder);
                return regex.test(filePath);
            } catch (e) {
                return filePath.includes(folder);
            }
        });
    }

    private shouldIgnoreTag(tag: string): boolean {
        // 移除 # 符号
        const cleanTag = tag.substring(1);
        return this.plugin.settings.ignoreTags.includes(cleanTag);
    }

    // 切换文件的书签状态
    private toggleBookmark(file: TFile): void {
        try {
            // 获取书签插件实例
            const bookmarkPlugin = (this.app as any).internalPlugins.plugins.bookmarks;
            if (!bookmarkPlugin || !bookmarkPlugin.enabled) {
                new Notice("书签功能未启用");
                return;
            }

            // 检查文件是否已收藏
            const isBookmarked = this.isFileBookmarked(file);

            // 获取书签管理器实例
            const bookmarkManager = bookmarkPlugin.instance;

            if (isBookmarked) {
                // 移除书签 - 使用新的API方式
                if (typeof bookmarkManager.removeItem === 'function') {
                    // 新版API
                    bookmarkManager.removeItem({
                        type: 'file',
                        path: file.path
                    });
                } else if (typeof bookmarkManager.removeBookmark === 'function') {
                    // 旧版API
                    bookmarkManager.removeBookmark({
                        type: 'file',
                        path: file.path
                    });
                } else {
                    throw new Error("无法找到有效的书签移除方法");
                }
                new Notice("已取消收藏");
            } else {
                // 添加书签 - 使用新的API方式
                if (typeof bookmarkManager.addItem === 'function') {
                    // 新版API
                    bookmarkManager.addItem({
                        type: 'file',
                        path: file.path,
                        title: file.basename
                    });
                } else if (typeof bookmarkManager.addBookmark === 'function') {
                    // 旧版API
                    bookmarkManager.addBookmark({
                        type: 'file',
                        path: file.path,
                        title: file.basename
                    });
                } else {
                    throw new Error("无法找到有效的书签添加方法");
                }
                new Notice("已添加到收藏");
            }

            // 刷新书签视图 - 兼容不同版本
            if (typeof bookmarkManager.trigger === 'function') {
                bookmarkManager.trigger("changed");
            } else if (typeof bookmarkManager.requestSave === 'function') {
                bookmarkManager.requestSave();
            }
        } catch (e) {
            console.error("切换书签状态时出错:", e);
            new Notice("操作书签失败: " + e.message);
        }
    }

    // 检查文件是否已收藏
    private isFileBookmarked(file: TFile): boolean {
        // 尝试访问书签插件API
        try {
            // 获取书签插件实例
            const bookmarkPlugin = (this.app as any).internalPlugins.plugins.bookmarks;
            if (!bookmarkPlugin || !bookmarkPlugin.enabled) return false;

            // 获取书签管理器实例
            const bookmarkManager = bookmarkPlugin.instance;

            // 尝试不同的API获取书签项
            let bookmarks: any[] = [];

            if (bookmarkManager.items) {
                // 直接访问items属性
                bookmarks = bookmarkManager.items;
            } else if (typeof bookmarkManager.getItems === 'function') {
                // 通过getItems方法获取
                bookmarks = bookmarkManager.getItems();
            } else {
                console.log("无法获取书签列表");
                return false;
            }

            // 检查文件是否在书签中
            return bookmarks.some((item: any) =>
                item.type === 'file' && item.path === file.path
            );
        } catch (e) {
            console.error("检查书签状态时出错:", e);
            return false;
        }
    }

    // 在系统资源管理器中打开文件
    private openInSystemExplorer(filePath: string): void {
        try {
            // 获取完整路径 - 修复 getFullPath 方法不存在的问题
            const fullPath = (this.app.vault.adapter as any).getFullPath?.(filePath) || 
                             (this.app.vault as any).getResourcePath(filePath);

            // 使用 Electron 的 shell 模块打开文件
            const { shell } = require('electron');

            // 打开文件所在的文件夹并选中该文件
            shell.showItemInFolder(fullPath);

            new Notice("已在资源管理器中打开");
        } catch (e) {
            console.error("在系统资源管理器中打开文件时出错:", e);
            new Notice("无法在系统资源管理器中打开文件");
        }
    }
    private handleSearch(query: string) {
        if (!query) {
            this.refreshView();
            return;
        }
        
        query = query.toLowerCase();
        
        // 搜索标签
        const tagElements = this.tagContainer.querySelectorAll('.tag-item');
        tagElements.forEach((el: Element) => {
            const tagNameEl = el.querySelector('.tag-name');
            const tagName = tagNameEl ? tagNameEl.textContent?.toLowerCase() || '' : '';
            
            if (tagName.includes(query)) {
                (el as HTMLElement).style.display = 'flex';
            } else {
                (el as HTMLElement).style.display = 'none';
            }
        });
        
        // 如果当前有选中的标签，也搜索文件
        if (this.currentTag === null) {
            // 搜索无标签文件
            const filteredFiles = this.untaggedFiles.filter(file =>
                file.basename.toLowerCase().includes(query)
            );

            this.renderFilteredFiles(filteredFiles);
        } else if (this.currentTag.startsWith('parent-only:')) {
            // 搜索仅父标签文件
            const parentTag = this.currentTag.substring('parent-only:'.length);
            const files = this.tagMap.get(parentTag) || [];
            const filteredFiles = files.filter(file =>
                file.basename.toLowerCase().includes(query)
            );

            this.renderFilteredFiles(filteredFiles);
        } else {
            // 搜索普通标签文件
            const files = this.tagMap.get(this.currentTag) || [];
            const filteredFiles = files.filter(file =>
                file.basename.toLowerCase().includes(query)
            );

            this.renderFilteredFiles(filteredFiles);
        }
    
        
        
    }
    // 渲染过滤后的文件列表
    private renderFilteredFiles(filteredFiles: TFile[]) {
        this.fileContainer.empty();

        if (filteredFiles.length === 0) {
            this.fileContainer.createDiv('empty-message').setText('没有匹配的文件');
            return;
        }

        for (const file of filteredFiles) {
            const fileEl = this.fileContainer.createDiv('file-item');

            const iconEl = fileEl.createDiv('file-icon');
            iconEl.setText('📄');

            const fileInfoEl = fileEl.createDiv('file-info');

            const nameEl = fileInfoEl.createDiv('file-name');
            nameEl.setText(file.basename);
            nameEl.setAttribute('title', file.basename);

            const pathEl = fileInfoEl.createDiv('file-path');
            const relativePath = file.path.substring(0, file.path.lastIndexOf('/'));
            pathEl.setText(relativePath || '根目录');
            pathEl.setAttribute('title', relativePath || '根目录');

            fileEl.addEventListener('click', () => {
                // 移除其他文件的选中状态
                this.fileContainer.querySelectorAll('.file-item').forEach(el => {
                    el.removeClass('selected');
                });
                // 添加当前文件的选中状态
                fileEl.addClass('selected');

                this.app.workspace.getLeaf().openFile(file);
            });

            fileEl.addEventListener('contextmenu', (e) => {
                // 移除其他文件的选中状态
                this.fileContainer.querySelectorAll('.file-item').forEach(el => {
                    el.removeClass('selected');
                });
                // 添加当前文件的选中状态
                fileEl.addClass('selected');

                e.preventDefault();
                this.showFileContextMenu(file, e);
            });
        }
    }
    
}