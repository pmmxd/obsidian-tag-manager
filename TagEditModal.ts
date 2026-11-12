import { App, Modal, TFile, Setting, Notice } from 'obsidian';  // 添加 Notice 导入

export class TagEditModal extends Modal {
    private files: TFile[];
    private currentTags: string[];
    private allTags: string[];
    private selectedTags: Set<string>;
    private allFileTags: string[];
    private onSave: () => Promise<void>;
    private editMode: 'replace' | 'append' = 'replace'; // 新增：编辑模式，默认为替换模式

    constructor(
        app: App,
        files: TFile[],
        currentTags: string[],
        allTags: string[],
        allFileTags: string[],
        onSave: () => Promise<void>
    ) {
        super(app);
        this.files = files;
        this.currentTags = currentTags;
        this.allTags = allTags;
        this.allFileTags = allFileTags;
        this.selectedTags = new Set(currentTags);
        this.onSave = onSave;

        // 添加类名以便应用样式
        this.modalEl.addClass('tag-edit-modal');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // 添加标题
        if (this.files.length === 1) {
            contentEl.createEl('h3', { text: `编辑文件标签: ${this.files[0].basename}` });
        } else {
            contentEl.createEl('h3', { text: `批量编辑 ${this.files.length} 个文件的标签` });
        }

        // 创建内容容器
        const modalContent = contentEl.createDiv({ cls: 'modal-content' });

        // 新增：编辑模式选择
        if (this.files.length > 1) {
            const modeContainer = modalContent.createDiv({ cls: 'edit-mode-container' });
            modeContainer.createEl('h4', { text: '编辑模式' });
            
            const modeSelection = modeContainer.createDiv({ cls: 'edit-mode-selection' });
            
            // 替换模式按钮
            const replaceButton = modeSelection.createEl('button', {
                text: '替换模式',
                cls: 'mode-button replace-mode active'
            });
            
            // 增量模式按钮
            const appendButton = modeSelection.createEl('button', {
                text: '增量模式',
                cls: 'mode-button append-mode'
            });
            
            // 模式说明
            const modeDescription = modeContainer.createDiv({ cls: 'mode-description' });
            modeDescription.setText('替换模式：完全替换文件的现有标签');
            
            // 模式切换事件
            replaceButton.addEventListener('click', () => {
                this.editMode = 'replace';
                replaceButton.addClass('active');
                appendButton.removeClass('active');
                modeDescription.setText('替换模式：完全替换文件的现有标签');
            });
            
            appendButton.addEventListener('click', () => {
                this.editMode = 'append';
                appendButton.addClass('active');
                replaceButton.removeClass('active');
                modeDescription.setText('增量模式：保留文件原有标签，添加新选择的标签');
            });
        }

        // 当前标签部分
        modalContent.createEl('h4', { text: '当前标签' });
        const currentTagsContainer = modalContent.createDiv({ cls: 'tag-buttons current-tags' });
        
        if (this.currentTags.length === 0) {
            currentTagsContainer.createEl('span', { text: '无标签', cls: 'no-tags' });
        } else {
            this.renderTagButtons(currentTagsContainer, this.currentTags, true);
        }

        // 所有标签部分
        modalContent.createEl('h4', { text: '所有标签' });
        const allTagsContainer = modalContent.createDiv({ cls: 'tag-buttons all-tags' });
        
        if (this.allTags.length === 0) {
            allTagsContainer.createEl('span', { text: '无标签', cls: 'no-tags' });
        } else {
            this.renderTagButtons(allTagsContainer, this.allTags, false);
        }

        // 添加新标签部分
        modalContent.createEl('h4', { text: '添加新标签' });
        const tagInputContainer = modalContent.createDiv({ cls: 'tag-input-container' });
        const tagInput = tagInputContainer.createEl('input', {
            type: 'text',
            cls: 'tag-input',
            placeholder: '输入新标签...'
        });
        
        const addButton = tagInputContainer.createEl('button', {
            text: '添加',
            cls: 'add-tag-button'
        });

        // 添加标签的点击事件
        addButton.addEventListener('click', () => {
            const newTag = tagInput.value.trim();
            if (newTag) {
                this.addTag(newTag);
                tagInput.value = '';
                tagInput.focus();
            }
        });

        // 输入框回车事件
        tagInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const newTag = tagInput.value.trim();
                if (newTag) {
                    this.addTag(newTag);
                    tagInput.value = '';
                }
            }
        });

        // 操作按钮
        const actionButtons = modalContent.createDiv({ cls: 'action-buttons' });
        
        const cancelButton = actionButtons.createEl('button', {
            text: '取消',
            cls: 'cancel-button'
        });
        
        const saveButton = actionButtons.createEl('button', {
            text: '保存',
            cls: 'save-button'
        });

        cancelButton.addEventListener('click', () => {
            this.close();
        });

        saveButton.addEventListener('click', () => {
            this.saveChanges();
        });
    }

    // 渲染标签按钮
    private renderTagButtons(container: HTMLElement, tags: string[], isCurrentTags: boolean) {
        container.empty();
        
        // 按字母顺序排序标签
        const sortedTags = [...tags].sort((a, b) => a.localeCompare(b));
        
        for (const tag of sortedTags) {
            const tagButton = container.createEl('button', {
                cls: 'tag-button',
                text: tag
            });
            
            // 如果标签已被选中，添加选中样式
            if (this.selectedTags.has(tag)) {
                tagButton.addClass('selected');
            }
            
            // 点击标签按钮切换选中状态
            tagButton.addEventListener('click', () => {
                this.toggleTag(tag, tagButton);
            });
        }
    }

    // 切换标签选中状态
    private toggleTag(tag: string, button: HTMLElement) {
        if (this.selectedTags.has(tag)) {
            // 取消选中标签
            this.selectedTags.delete(tag);
            button.removeClass('selected');

            // 更新"当前标签"部分，移除取消选中的标签
            const currentTagsContainer = this.contentEl.querySelector('.current-tags') as HTMLElement;
            if (currentTagsContainer) {
                this.renderTagButtons(currentTagsContainer, Array.from(this.selectedTags), true);
            }

            // 更新"所有标签"部分的选中状态
            const allTagsContainer = this.contentEl.querySelector('.all-tags') as HTMLElement;
            if (allTagsContainer) {
                // 找到对应的标签按钮并移除选中状态
                const tagButtons = allTagsContainer.querySelectorAll('.tag-button');
                tagButtons.forEach(btn => {
                    if (btn.textContent === tag) {
                        btn.removeClass('selected');
                    }
                });
            }
        } else {
            // 选中标签
            this.selectedTags.add(tag);
            button.addClass('selected');

            // 更新"当前标签"部分，添加新选中的标签
            const currentTagsContainer = this.contentEl.querySelector('.current-tags') as HTMLElement;
            if (currentTagsContainer) {
                this.renderTagButtons(currentTagsContainer, Array.from(this.selectedTags), true);
            }

            // 更新"所有标签"部分的选中状态
            const allTagsContainer = this.contentEl.querySelector('.all-tags') as HTMLElement;
            if (allTagsContainer) {
                // 找到对应的标签按钮并添加选中状态
                const tagButtons = allTagsContainer.querySelectorAll('.tag-button');
                tagButtons.forEach(btn => {
                    if (btn.textContent === tag) {
                        btn.addClass('selected');
                    }
                });
            }
        }
    }

    // 添加新标签
    private addTag(tag: string) {
        // 如果标签不存在于所有标签中，添加它
        if (!this.allTags.includes(tag)) {
            this.allTags.push(tag);
            
            // 更新"所有标签"部分
            const allTagsContainer = this.contentEl.querySelector('.all-tags') as HTMLElement;  // 添加类型断言
            if (allTagsContainer) {
                this.renderTagButtons(allTagsContainer, this.allTags, false);
            }
        }
        
        // 添加到选中标签
        this.selectedTags.add(tag);
        
        // 更新"当前标签"部分
        const currentTagsContainer = this.contentEl.querySelector('.current-tags') as HTMLElement;  // 添加类型断言
        if (currentTagsContainer) {
            this.renderTagButtons(currentTagsContainer, Array.from(this.selectedTags), true);
        }
    }

    // 保存更改
    private async saveChanges() {
        try {
            // 获取选中的标签
            const selectedTags = Array.from(this.selectedTags);
            
            // 为每个文件更新标签
            for (const file of this.files) {
                await this.updateFileTags(file, selectedTags);
            }
            
            // 调用保存回调
            await this.onSave();
            
            // 关闭弹窗
            this.close();
        } catch (error) {
            console.error('保存标签失败:', error);
            new Notice(`保存标签失败: ${error.message}`);
        }
    }

    // 更新文件标签
    private async updateFileTags(file: TFile, tags: string[]) {
        try {
            // 读取文件内容
            const content = await this.app.vault.read(file);
            
            // 根据编辑模式更新文件内容中的标签
            let newContent: string;
            
            if (this.editMode === 'append') {
                // 增量模式：获取文件当前的标签并合并
                const cache = this.app.metadataCache.getFileCache(file);
                // 改进获取标签的方式，确保能获取到所有标签
                let currentFileTags: string[] = [];
                
                if (cache?.tags) {
                    // 从缓存中获取标签
                    currentFileTags = cache.tags.map(tag => tag.tag.substring(1));
                } else if (cache?.frontmatter?.tags) {
                    // 从frontmatter中获取标签
                    const fmTags = cache.frontmatter.tags;
                    if (Array.isArray(fmTags)) {
                        currentFileTags = fmTags;
                    } else if (typeof fmTags === 'string') {
                        currentFileTags = [fmTags];
                    }
                }
                
                // 合并当前标签和选中标签，去重
                const mergedTags = Array.from(new Set([...currentFileTags, ...tags]));
                newContent = this.updateContentTags(content, mergedTags);
            } else {
                // 替换模式：直接使用选中的标签
                newContent = this.updateContentTags(content, tags);
            }
            
            // 如果内容有变化，保存文件
            if (newContent !== content) {
                await this.app.vault.modify(file, newContent);
            }
        } catch (error) {
            console.error(`更新文件 ${file.path} 的标签失败:`, error);
            throw error;
        }
    }

    // 更新文件内容中的标签
    private updateContentTags(content: string, tags: string[]): string {
        // 检查是否有 YAML frontmatter
        const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
        const frontmatterMatch = content.match(frontmatterRegex);
        
        if (frontmatterMatch) {
            // 有 frontmatter，更新其中的标签
            const frontmatter = frontmatterMatch[1];
            const restContent = content.slice(frontmatterMatch[0].length);
            
            // 检查 frontmatter 中是否已有标签
            const tagsRegex = /tags:\s*(\[.*?\]|(?:-.*?\n)+)/s;
            const tagsMatch = frontmatter.match(tagsRegex);
            
            let newFrontmatter: string;
            
            if (tagsMatch) {
                // 替换现有标签
                if (tags.length === 0) {
                    // 如果没有标签，移除整个 tags 行
                    newFrontmatter = frontmatter.replace(tagsRegex, '');
                } else {
                    // 使用数组格式替换标签
                    const tagsStr = tags.map(t => `"${t}"`).join(', ');
                    newFrontmatter = frontmatter.replace(tagsRegex, `tags: [${tagsStr}]`);
                }
            } else {
                // 添加新的标签行
                if (tags.length > 0) {
                    const tagsStr = tags.map(t => `"${t}"`).join(', ');
                    newFrontmatter = `${frontmatter}\ntags: [${tagsStr}]`;
                } else {
                    newFrontmatter = frontmatter;
                }
            }
            
            return `---\n${newFrontmatter}\n---${restContent}`;
        } else {
            // 没有 frontmatter，添加新的 frontmatter
            if (tags.length > 0) {
                const tagsStr = tags.map(t => `"${t}"`).join(', ');
                return `---\ntags: [${tagsStr}]\n---\n\n${content}`;
            }
            return content;
        }
    }
}