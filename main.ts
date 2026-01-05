import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// ============================================================================
// Settings Interface (简化版 - 专注于加粗/斜体处理，配合 Linter 使用)
// ============================================================================
interface SmartSpacingSettings {
	removeInternalBoldSpaces: boolean;  // 清理加粗内部空格
	spaceBetweenChineseAndBold: boolean;
	spaceBetweenEnglishAndBold: boolean;
	spaceBetweenChineseAndItalic: boolean;
	skipCodeBlocks: boolean;
	skipInlineCode: boolean;
}

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

		// Command: Fix only bold spacing
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

		console.debug('Smart Spacing Plugin loaded (Linter companion mode)');
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
		const newContent = this.processText(content);
		if (content !== newContent) {
			const cursor = editor.getCursor();
			editor.setValue(newContent);
			editor.setCursor(cursor);
			if (showNotice) {
				new Notice('Bold/italic spacing fixed');
			}
		} else if (showNotice) {
			new Notice('No changes needed.');
		}
	}

	// ========================================================================
	// Main Processing Function
	// ========================================================================
	processText(text: string): string {
		let result = text;
		
		// Step 1: Remove internal bold/italic spaces (** text ** → **text**)
		if (this.settings.removeInternalBoldSpaces) {
			result = this.removeInternalSpaces(result);
		}
		
		// Step 2: Fix bold spacing (uses state machine)
		if (this.settings.spaceBetweenChineseAndBold) {
			result = this.fixBoldSpacing(result);
		}

		// Step 3: Fix italic spacing
		if (this.settings.spaceBetweenChineseAndItalic) {
			result = this.fixItalicSpacing(result);
		}

		return result;
	}

	// ========================================================================
	// Remove Internal Spaces (** text ** → **text**, * text * → *text*)
	// ========================================================================
	removeInternalSpaces(text: string): string {
		const lines = text.split('\n');
		const resultLines: string[] = [];
		let inCodeBlock = false;

		for (const line of lines) {
			if (this.settings.skipCodeBlocks && /^```|^~~~/.test(line.trim())) {
				inCodeBlock = !inCodeBlock;
				resultLines.push(line);
				continue;
			}

			if (inCodeBlock) {
				resultLines.push(line);
				continue;
			}

			resultLines.push(this.removeInternalSpacesInLine(line));
		}

		return resultLines.join('\n');
	}

	removeInternalSpacesInLine(line: string): string {
		// Protect inline code
		const protectedSections: { placeholder: string; original: string }[] = [];
		let protectedLine = line;
		
		if (this.settings.skipInlineCode) {
			const inlineCodeRegex = /`[^`]+`/g;
			let match;
			let index = 0;
			while ((match = inlineCodeRegex.exec(line)) !== null) {
				const placeholder = `\x00CODE${index}\x00`;
				protectedSections.push({ placeholder, original: match[0] });
				protectedLine = protectedLine.replace(match[0], placeholder);
				index++;
			}
		}

		// State machine to find and clean bold/italic markers
		let result = '';
		let i = 0;
		const markerStack: { type: string; startPos: number }[] = [];
		const len = protectedLine.length;

		while (i < len) {
			// Check for *** (bold+italic)
			if (protectedLine[i] === '*' && protectedLine[i + 1] === '*' && protectedLine[i + 2] === '*') {
				const lastMarker = markerStack[markerStack.length - 1];
				if (lastMarker && lastMarker.type === '***') {
					// Closing ***
					while (result.length > lastMarker.startPos && /\s/.test(result[result.length - 1])) {
						result = result.slice(0, -1);
					}
					result += '***';
					markerStack.pop();
					i += 3;
				} else {
					// Opening ***
					result += '***';
					markerStack.push({ type: '***', startPos: result.length });
					i += 3;
					while (i < len && /\s/.test(protectedLine[i])) i++;
				}
			}
			// Check for ** (bold)
			else if (protectedLine[i] === '*' && protectedLine[i + 1] === '*' && protectedLine[i + 2] !== '*') {
				const lastMarker = markerStack[markerStack.length - 1];
				if (lastMarker && lastMarker.type === '**') {
					// Closing **
					while (result.length > lastMarker.startPos && /\s/.test(result[result.length - 1])) {
						result = result.slice(0, -1);
					}
					result += '**';
					markerStack.pop();
					i += 2;
				} else {
					// Opening **
					result += '**';
					markerStack.push({ type: '**', startPos: result.length });
					i += 2;
					while (i < len && /\s/.test(protectedLine[i])) i++;
				}
			}
			// Check for single * (italic) - must not be adjacent to another *
			else if (protectedLine[i] === '*' && protectedLine[i - 1] !== '*' && protectedLine[i + 1] !== '*') {
				const lastMarker = markerStack[markerStack.length - 1];
				if (lastMarker && lastMarker.type === '*') {
					// Closing *
					while (result.length > lastMarker.startPos && /\s/.test(result[result.length - 1])) {
						result = result.slice(0, -1);
					}
					result += '*';
					markerStack.pop();
					i += 1;
				} else {
					// Opening *
					result += '*';
					markerStack.push({ type: '*', startPos: result.length });
					i += 1;
					while (i < len && /\s/.test(protectedLine[i])) i++;
				}
			}
			else {
				result += protectedLine[i];
				i++;
			}
		}

		// Restore protected sections
		for (const { placeholder, original } of protectedSections.reverse()) {
			result = result.replace(placeholder, original);
		}

		return result;
	}

	// ========================================================================
	// Bold Spacing Fixer (State Machine)
	// ========================================================================
	fixBoldSpacing(text: string): string {
		const lines = text.split('\n');
		const resultLines: string[] = [];
		let inCodeBlock = false;

		for (const line of lines) {
			if (this.settings.skipCodeBlocks && /^```|^~~~/.test(line.trim())) {
				inCodeBlock = !inCodeBlock;
				resultLines.push(line);
				continue;
			}

			if (inCodeBlock) {
				resultLines.push(line);
				continue;
			}

			resultLines.push(this.fixBoldSpacingInLine(line));
		}

		return resultLines.join('\n');
	}

	fixBoldSpacingInLine(line: string): string {
		// Protect inline code
		const protectedSections: { placeholder: string; original: string }[] = [];
		let protectedLine = line;
		
		if (this.settings.skipInlineCode) {
			const inlineCodeRegex = /`[^`]+`/g;
			let match;
			let index = 0;
			while ((match = inlineCodeRegex.exec(line)) !== null) {
				const placeholder = `\x00CODE${index}\x00`;
				protectedSections.push({ placeholder, original: match[0] });
				protectedLine = protectedLine.replace(match[0], placeholder);
				index++;
			}
		}

		// State machine for bold markers
		let result = '';
		let i = 0;
		let isBold = false;
		const len = protectedLine.length;

		while (i < len) {
			// Check for *** (bold+italic)
			if (protectedLine[i] === '*' && protectedLine[i + 1] === '*' && protectedLine[i + 2] === '*') {
				if (!isBold) {
					if (this.shouldAddSpaceBefore(result[result.length - 1])) {
						result += ' ';
					}
					result += '***';
					isBold = true;
					i += 3;
				} else {
					result += '***';
					isBold = false;
					i += 3;
					if (this.shouldAddSpaceAfter(protectedLine[i])) {
						result += ' ';
					}
				}
			}
			// Check for ** (bold)
			else if (protectedLine[i] === '*' && protectedLine[i + 1] === '*' && protectedLine[i + 2] !== '*') {
				if (!isBold) {
					if (this.shouldAddSpaceBefore(result[result.length - 1])) {
						result += ' ';
					}
					result += '**';
					isBold = true;
					i += 2;
				} else {
					result += '**';
					isBold = false;
					i += 2;
					if (this.shouldAddSpaceAfter(protectedLine[i])) {
						result += ' ';
					}
				}
			}
			else {
				result += protectedLine[i];
				i++;
			}
		}

		// Restore protected sections
		for (const { placeholder, original } of protectedSections.reverse()) {
			result = result.replace(placeholder, original);
		}

		return result;
	}

	shouldAddSpaceBefore(char: string): boolean {
		if (!char || char === ' ' || char === '\t') return false;
		if (/[\u4e00-\u9fa5]/.test(char)) return this.settings.spaceBetweenChineseAndBold;
		if (/[a-zA-Z0-9]/.test(char)) return this.settings.spaceBetweenEnglishAndBold;
		return false;
	}

	shouldAddSpaceAfter(char: string): boolean {
		if (!char || char === ' ' || char === '\t' || char === '\n') return false;
		if (/[\u4e00-\u9fa5]/.test(char)) return this.settings.spaceBetweenChineseAndBold;
		if (/[a-zA-Z0-9]/.test(char)) return this.settings.spaceBetweenEnglishAndBold;
		return false;
	}

	// ========================================================================
	// Italic Spacing Fixer (State Machine)
	// ========================================================================
	fixItalicSpacing(text: string): string {
		const lines = text.split('\n');
		const resultLines: string[] = [];
		let inCodeBlock = false;

		for (const line of lines) {
			if (this.settings.skipCodeBlocks && /^```|^~~~/.test(line.trim())) {
				inCodeBlock = !inCodeBlock;
				resultLines.push(line);
				continue;
			}

			if (inCodeBlock) {
				resultLines.push(line);
				continue;
			}

			resultLines.push(this.fixItalicSpacingInLine(line));
		}

		return resultLines.join('\n');
	}

	fixItalicSpacingInLine(line: string): string {
		// Protect inline code and bold sections
		const protectedSections: { placeholder: string; original: string }[] = [];
		let protectedLine = line;
		
		if (this.settings.skipInlineCode) {
			const inlineCodeRegex = /`[^`]+`/g;
			let match;
			let index = 0;
			while ((match = inlineCodeRegex.exec(line)) !== null) {
				const placeholder = `\x00CODE${index}\x00`;
				protectedSections.push({ placeholder, original: match[0] });
				protectedLine = protectedLine.replace(match[0], placeholder);
				index++;
			}
		}

		// Protect bold and bold+italic
		const boldRegex = /\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*/g;
		let boldMatch;
		let boldIndex = 0;
		while ((boldMatch = boldRegex.exec(protectedLine)) !== null) {
			const placeholder = `\x00BOLD${boldIndex}\x00`;
			protectedSections.push({ placeholder, original: boldMatch[0] });
			protectedLine = protectedLine.replace(boldMatch[0], placeholder);
			boldIndex++;
		}

		// State machine for single * (italic)
		let result = '';
		let i = 0;
		let isItalic = false;
		const len = protectedLine.length;

		while (i < len) {
			if (protectedLine[i] === '*' && protectedLine[i - 1] !== '*' && protectedLine[i + 1] !== '*') {
				if (!isItalic) {
					const charBefore = result[result.length - 1];
					if (charBefore && /[\u4e00-\u9fa5]/.test(charBefore) && charBefore !== ' ') {
						result += ' ';
					}
					result += '*';
					isItalic = true;
					i++;
				} else {
					result += '*';
					isItalic = false;
					i++;
					const charAfter = protectedLine[i];
					if (charAfter && /[\u4e00-\u9fa5]/.test(charAfter)) {
						result += ' ';
					}
				}
			} else {
				result += protectedLine[i];
				i++;
			}
		}

		// Restore protected sections
		for (const { placeholder, original } of protectedSections.reverse()) {
			result = result.replace(placeholder, original);
		}

		return result;
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
