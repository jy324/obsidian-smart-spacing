import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { processText, SmartSpacingSettings } from './processor';

// ============================================================================
// Constants & Defaults
// ============================================================================

const DEFAULT_SETTINGS: SmartSpacingSettings = {
	removeInternalBoldSpaces: true,
	spaceBetweenChineseAndBold: true,
	spaceBetweenEnglishAndBold: false,
	spaceBetweenChineseAndItalic: true,
	skipCodeBlocks: true,
	skipInlineCode: true,
};

// ============================================================================
// Main Plugin Class
// ============================================================================
export default class SmartSpacingPlugin extends Plugin {
	settings: SmartSpacingSettings;

	async onload() {
		await this.loadSettings();

		// Command: Fix all spacing (designed for Linter custom command)
		this.addCommand({
			id: 'fix-all-spacing',
			name: 'Fix all spacing',
			editorCallback: (editor: Editor, _view: MarkdownView) => {
				this.formatEditor(editor, true);
			}
		});

		// Command: Fix bold spacing (Legacy command, performs full fix)
		this.addCommand({
			id: 'fix-bold-spacing',
			name: 'Fix bold spacing only',
			editorCallback: (editor: Editor, _view: MarkdownView) => {
				this.formatEditor(editor, true);
			}
		});

		// Command: Silent fix (no notice, for automation)
		this.addCommand({
			id: 'fix-all-spacing-silent',
			name: 'Fix all spacing (silent)',
			editorCallback: (editor: Editor, _view: MarkdownView) => {
				this.formatEditor(editor, false);
			}
		});

		// Add settings tab
		this.addSettingTab(new SmartSpacingSettingTab(this.app, this));

		console.debug('Smart Spacing Plugin loaded (Refactored)');
	}

	onunload() {
		console.debug('Smart Spacing Plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Format the editor content
	 */
	formatEditor(editor: Editor, showNotice: boolean): void {
		const content = editor.getValue();
		// Use the extracted processor
		const newContent = processText(content, this.settings);

		if (content !== newContent) {
			const cursor = editor.getCursor();
			editor.setValue(newContent);
			editor.setCursor(cursor);
			if (showNotice) {
				new Notice('Smart spacing fixed');
			}
		} else if (showNotice) {
			new Notice('No changes needed.');
		}
	}
}

// ============================================================================
// Settings Tab
// ============================================================================
class SmartSpacingSettingTab extends PluginSettingTab {
	plugin: SmartSpacingPlugin;

	constructor(app: App, plugin: SmartSpacingPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Smart spacing')
			.setHeading();

		containerEl.createEl('p', {
			text: '💡 此插件专注于处理加粗/斜体的空格问题，建议配合 linter 插件使用。',
			cls: 'setting-item-description'
		});

		new Setting(containerEl)
			.setName('核心功能')
			.setHeading();

		new Setting(containerEl)
			.setName('🧹 清理加粗/斜体内部空格')
			.setDesc('修复 ** 文本 ** → **文本**，* 文本 * → *文本*')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.removeInternalBoldSpaces)
				.onChange(async (value) => {
					this.plugin.settings.removeInternalBoldSpaces = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('中文与加粗之间添加空格')
			.setDesc('中文**加粗** → 中文 **加粗**')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.spaceBetweenChineseAndBold)
				.onChange(async (value) => {
					this.plugin.settings.spaceBetweenChineseAndBold = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('英文与加粗之间添加空格')
			.setDesc('Word**bold** → word **bold**（通常不需要）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.spaceBetweenEnglishAndBold)
				.onChange(async (value) => {
					this.plugin.settings.spaceBetweenEnglishAndBold = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('中文与斜体之间添加空格')
			.setDesc('中文*斜体* → 中文 *斜体*')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.spaceBetweenChineseAndItalic)
				.onChange(async (value) => {
					this.plugin.settings.spaceBetweenChineseAndItalic = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('保护规则')
			.setHeading();

		new Setting(containerEl)
			.setName('跳过代码块')
			.setDesc('不修改 ``` 代码块内的内容')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.skipCodeBlocks)
				.onChange(async (value) => {
					this.plugin.settings.skipCodeBlocks = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('跳过行内代码')
			.setDesc('不修改 `code` 内的内容')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.skipInlineCode)
				.onChange(async (value) => {
					this.plugin.settings.skipInlineCode = value;
					await this.plugin.saveSettings();
				}));

		// Linter integration guide
		new Setting(containerEl)
			.setName('📋 配合 linter 使用')
			.setHeading();

		const guideEl = containerEl.createEl('div', { cls: 'setting-item-description' });

		// Create paragraphs and lists using DOM API
		const p1 = guideEl.createEl('p');
		p1.textContent = '在 linter 设置中添加 custom command：';

		const ol = guideEl.createEl('ol');
		const li1 = ol.createEl('li');
		li1.textContent = '打开 linter 设置 → custom commands';
		const li2 = ol.createEl('li');
		li2.appendText('添加命令：');
		const code = li2.createEl('code');
		code.textContent = 'Smart spacing for chinese: fix all spacing';
		const li3 = ol.createEl('li');
		li3.textContent = 'Linter 会在格式化时自动调用本插件';

		const p2 = guideEl.createEl('p');
		const strong1 = p2.createEl('strong');
		strong1.textContent = '分工说明：';

		const ul = guideEl.createEl('ul');
		const li4 = ul.createEl('li');
		li4.appendText('✅ ');
		const strong2 = li4.createEl('strong');
		strong2.textContent = '本插件负责';
		li4.appendText('：加粗/斜体的空格处理（状态机算法，不会出错）');
		const li5 = ul.createEl('li');
		li5.appendText('✅ ');
		const strong3 = li5.createEl('strong');
		strong3.textContent = 'Linter 负责';
		li5.appendText('：中英文空格、中数字空格、其他格式化');
	}
}
