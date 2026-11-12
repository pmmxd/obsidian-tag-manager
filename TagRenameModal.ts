import { App, Modal, Setting } from 'obsidian';

export class TagRenameModal extends Modal {
    private oldTag: string;
    private newTag: string;
    private onSubmit: (newTag: string) => void;

    constructor(app: App, oldTag: string, onSubmit: (newTag: string) => void) {
        super(app);
        this.oldTag = oldTag.startsWith('#') ? oldTag : '#' + oldTag;
        this.newTag = this.oldTag;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        
        contentEl.createEl('h2', { text: '修改标签名称' });

        new Setting(contentEl)
            .setName('原标签名')
            .setDesc('当前标签名称')
            .addText(text => text
                .setValue(this.oldTag)
                .setDisabled(true));

        new Setting(contentEl)
            .setName('新标签名')
            .setDesc('输入新的标签名称')
            .addText(text => text
                .setValue(this.newTag)
                .onChange(value => {
                    this.newTag = value.startsWith('#') ? value : '#' + value;
                }));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('取消')
                .setCta()
                .onClick(() => {
                    this.close();
                }))
            .addButton(btn => btn
                .setButtonText('确认')
                .setCta()
                .onClick(() => {
                    this.onSubmit(this.newTag);
                    this.close();
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}