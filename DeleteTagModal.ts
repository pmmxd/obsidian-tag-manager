import { App, Modal, Setting } from 'obsidian';

export class DeleteTagModal extends Modal {
    private tag: string;
    private onConfirm: (confirmed: boolean) => void;

    constructor(app: App, tag: string, onConfirm: (confirmed: boolean) => void) {
        super(app);
        this.tag = tag.startsWith('#') ? tag : '#' + tag;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        
        contentEl.createEl('h2', { text: '确认删除标签' });
        
        contentEl.createEl('p', { 
            text: `您确定要删除标签 ${this.tag} 吗？这将从所有相关文件中移除该标签。` 
        });
        
        contentEl.createEl('p', { 
            text: `注意：此操作不会删除文件，只会移除标签。`,
            cls: 'warning-text'
        });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('取消')
                .setCta()
                .onClick(() => {
                    this.onConfirm(false);
                    this.close();
                }))
            .addButton(btn => btn
                .setButtonText('确认删除')
                .setWarning()
                .onClick(() => {
                    this.onConfirm(true);
                    this.close();
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}