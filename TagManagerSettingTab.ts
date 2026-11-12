import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import TagManagerPlugin from './main';

export class TagManagerSettingTab extends PluginSettingTab {
    plugin: TagManagerPlugin;

    constructor(app: App, plugin: TagManagerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: '标签管理器设置' });

        new Setting(containerEl)
            .setName('启动时自动打开')
            .setDesc('启动 Obsidian 时自动打开标签管理器')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoOpen)
                .onChange(async (value) => {
                    this.plugin.settings.autoOpen = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('忽略文件夹')
            .setDesc('输入要忽略的文件夹路径，使用逗号分隔。支持正则表达式。')
            .addText(text => text
                .setPlaceholder('folder1, folder2, .*\\.git.*')
                .setValue(this.plugin.settings.ignoreFolders.join(', '))
                .onChange(async (value) => {
                    this.plugin.settings.ignoreFolders = value.split(',').map(s => s.trim()).filter(s => s);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('忽略标签')
            .setDesc('输入要忽略的标签，使用逗号分隔')
            .addText(text => text
                .setPlaceholder('tag1, tag2')
                .setValue(this.plugin.settings.ignoreTags.join(', '))
                .onChange(async (value) => {
                    this.plugin.settings.ignoreTags = value.split(',').map(s => s.trim()).filter(s => s);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('文件夹图标')
            .setDesc('设置文件夹的图标名称')
            .addText(text => text
                .setValue(this.plugin.settings.folderIcon)
                .onChange(async (value) => {
                    this.plugin.settings.folderIcon = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('文件图标')
            .setDesc('设置文件的图标名称')
            .addText(text => text
                .setValue(this.plugin.settings.fileIcon)
                .onChange(async (value) => {
                    this.plugin.settings.fileIcon = value;
                    await this.plugin.saveSettings();
                }));

        // 添加重载文件树按钮
        new Setting(containerEl)
            .setName('重载文件树')
            .setDesc('重新扫描所有文件并刷新标签视图')
            .addButton(button => button
                .setButtonText('重载')
                .setCta()
                .onClick(async () => {
                    const tagView = this.plugin.getTagView();
                    if (tagView) {
                        await tagView.refreshViewPublic();
                        new Notice('文件树已重载');
                    } else {
                        new Notice('标签视图未打开');
                    }
                }));

        // 在 display 方法中添加彩虹大纲设置
        new Setting(containerEl)
            .setName('启用彩虹大纲')
            .setDesc('为不同层级的标签显示不同颜色的边框')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableRainbowOutline)
                .onChange(async (value) => {
                    this.plugin.settings.enableRainbowOutline = value;
                    await this.plugin.saveSettings();
                    
                    // 刷新视图
                    const tagView = this.plugin.getTagView();
                    if (tagView) {
                        await tagView.refreshViewPublic();
                    }
                }));

        new Setting(containerEl)
            .setName('显示标签折叠三角形')
            .setDesc('是否在标签列表中显示折叠/展开的三角形图标')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showTagToggleTriangle)
                .onChange(async (value) => {
                    this.plugin.settings.showTagToggleTriangle = value;
                    await this.plugin.saveSettings();
                    // 刷新视图以应用新设置
                    const tagView = this.plugin.getTagView();
                    if (tagView) {
                        await tagView.refreshView();
                    }
                }));
    }
}