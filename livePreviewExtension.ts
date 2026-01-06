/**
 * CodeMirror 6 extension for live preview spacing corrections
 * This provides real-time visual feedback for spacing issues without modifying the source
 */

import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { SmartSpacingSettings } from './processor';

/**
 * Creates decorations for spacing corrections in live preview mode
 */
function buildDecorations(view: EditorView, settings: SmartSpacingSettings): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const text = view.state.doc.toString();
	const lines = text.split('\n');
	let lineStart = 0;
	let inCodeBlock = false;
	let inLatexBlock = false;

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex];
		const trim = line.trim();
		
		// Track code blocks
		if (settings.skipCodeBlocks && /^```|^~~~/.test(trim)) {
			inCodeBlock = !inCodeBlock;
			lineStart += line.length + 1; // +1 for newline
			continue;
		}
		
		// Track LaTeX blocks
		if (/^\s*\$\$/.test(trim)) {
			// Check for single line $$ ... $$ (e.g. $$ E=mc^2 $$)
			if (!/^\s*\$\$.*\$\$\s*$/.test(trim) || trim === '$$') {
				inLatexBlock = !inLatexBlock;
			}
			lineStart += line.length + 1;
			continue;
		}
		
		// Skip if inside blocks
		if (inCodeBlock || inLatexBlock || trim.length === 0) {
			lineStart += line.length + 1; // +1 for newline
			continue;
		}

		// Check if we should add spacing decorations for this line
		const decorations = getLineDecorations(line, lineStart, settings);
		
		for (const dec of decorations) {
			builder.add(dec.from, dec.to, dec.decoration);
		}

		lineStart += line.length + 1; // +1 for newline
	}

	return builder.finish();
}

interface DecorationInfo {
	from: number;
	to: number;
	decoration: Decoration;
}

/**
 * Analyze a line and return decorations for spacing corrections
 * Note: This is a simplified version for live preview that doesn't modify text,
 * just shows visual hints where spaces should be added
 */
function getLineDecorations(line: string, lineStart: number, settings: SmartSpacingSettings): DecorationInfo[] {
	const decorations: DecorationInfo[] = [];
	
	// Protect inline code and latex before processing
	const protectedRanges = getProtectedRanges(line, settings);
	
	// Simple state machine to track bold/italic markers
	let i = 0;
	const len = line.length;
	let isBold = false;
	let isItalic = false;

	while (i < len) {
		// Skip if we're in a protected range
		if (isInProtectedRange(i, protectedRanges)) {
			i++;
			continue;
		}

		// Check for bold markers (**)
		if (i + 1 < len && line[i] === '*' && line[i + 1] === '*') {
			// Check if this is actually *** (bold+italic)
			if (i + 2 < len && line[i + 2] === '*') {
				// Handle *** marker
				if (!isBold) {
					// Opening ***
					const charBefore = i > 0 ? line[i - 1] : '';
					if (shouldAddSpaceBefore(charBefore, settings) && !isInProtectedRange(i - 1, protectedRanges)) {
						// Add decoration to show space should be here
						decorations.push({
							from: lineStart + i,
							to: lineStart + i,
							decoration: Decoration.widget({
								widget: new SpaceWidget(),
								side: -1
							})
						});
					}
				}
				isBold = !isBold;
				i += 3;
				continue;
			}
			
			// Regular ** marker
			if (!isBold) {
				// Opening **
				const charBefore = i > 0 ? line[i - 1] : '';
				if (shouldAddSpaceBefore(charBefore, settings) && !isInProtectedRange(i - 1, protectedRanges)) {
					decorations.push({
						from: lineStart + i,
						to: lineStart + i,
						decoration: Decoration.widget({
							widget: new SpaceWidget(),
							side: -1
						})
					});
				}
			} else {
				// Closing **
				const charAfter = i + 2 < len ? line[i + 2] : '';
				if (shouldAddSpaceAfter(charAfter, settings) && !isInProtectedRange(i + 2, protectedRanges)) {
					decorations.push({
						from: lineStart + i + 2,
						to: lineStart + i + 2,
						decoration: Decoration.widget({
							widget: new SpaceWidget(),
							side: 1
						})
					});
				}
			}
			isBold = !isBold;
			i += 2;
			continue;
		}

		// Check for italic markers (*)
		if (line[i] === '*') {
			if (!isItalic) {
				// Opening *
				const charBefore = i > 0 ? line[i - 1] : '';
				if (settings.spaceBetweenChineseAndItalic && isChinese(charBefore) && charBefore !== ' ' && !isInProtectedRange(i - 1, protectedRanges)) {
					decorations.push({
						from: lineStart + i,
						to: lineStart + i,
						decoration: Decoration.widget({
							widget: new SpaceWidget(),
							side: -1
						})
					});
				}
			} else {
				// Closing *
				const charAfter = i + 1 < len ? line[i + 1] : '';
				if (settings.spaceBetweenChineseAndItalic && isChinese(charAfter) && !isInProtectedRange(i + 1, protectedRanges)) {
					decorations.push({
						from: lineStart + i + 1,
						to: lineStart + i + 1,
						decoration: Decoration.widget({
							widget: new SpaceWidget(),
							side: 1
						})
					});
				}
			}
			isItalic = !isItalic;
			i += 1;
			continue;
		}

		i++;
	}

	return decorations;
}

/**
 * Get ranges that should be protected from decoration (inline code, latex, etc.)
 */
interface ProtectedRange {
	start: number;
	end: number;
}

function getProtectedRanges(line: string, settings: SmartSpacingSettings): ProtectedRange[] {
	const ranges: ProtectedRange[] = [];
	
	// Protect inline code (`code`)
	if (settings.skipInlineCode) {
		const codeRegex = /`[^`]+`/g;
		let match;
		while ((match = codeRegex.exec(line)) !== null) {
			ranges.push({ start: match.index, end: match.index + match[0].length });
		}
	}
	
	// Protect inline LaTeX ($...$)
	// Use a simpler approach without negative lookbehind for better compatibility
	for (let i = 0; i < line.length; i++) {
		if (line[i] === '$') {
			// Check if it's escaped
			if (i > 0 && line[i - 1] === '\\') {
				continue;
			}
			// Find the closing $
			let j = i + 1;
			while (j < line.length) {
				if (line[j] === '$' && (j === 0 || line[j - 1] !== '\\')) {
					ranges.push({ start: i, end: j + 1 });
					i = j; // Skip to after this LaTeX block
					break;
				}
				j++;
			}
		}
	}
	
	// Protect list markers at the start of the line
	const listMatch = /^(?:\s*)([*])(?=\s)/.exec(line);
	if (listMatch) {
		ranges.push({ start: 0, end: listMatch[0].length });
	}
	
	return ranges;
}

function isInProtectedRange(index: number, ranges: ProtectedRange[]): boolean {
	return ranges.some(range => index >= range.start && index < range.end);
}

/**
 * Widget that renders an invisible space for spacing correction
 */
class SpaceWidget extends WidgetType {
	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.textContent = ' ';
		span.className = 'smart-spacing-hint';
		return span;
	}

	eq(other: SpaceWidget): boolean {
		return true;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

// Helper functions
function isChinese(char: string): boolean {
	if (!char) return false;
	return /[\u4e00-\u9fa5]/.test(char);
}

function isAlphaNumeric(char: string): boolean {
	if (!char) return false;
	return /[a-zA-Z0-9]/.test(char);
}

function shouldAddSpaceBefore(char: string, settings: SmartSpacingSettings): boolean {
	if (!char || char === ' ' || char === '\t') return false;
	if (isChinese(char)) return settings.spaceBetweenChineseAndBold;
	if (isAlphaNumeric(char)) return settings.spaceBetweenEnglishAndBold;
	return false;
}

function shouldAddSpaceAfter(char: string, settings: SmartSpacingSettings): boolean {
	if (!char || char === ' ' || char === '\t' || char === '\n') return false;
	if (isChinese(char)) return settings.spaceBetweenChineseAndBold;
	if (isAlphaNumeric(char)) return settings.spaceBetweenEnglishAndBold;
	return false;
}

/**
 * Create the ViewPlugin that manages decorations
 */
export function createLivePreviewExtension(settings: SmartSpacingSettings) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			private updateTimeout: number | null = null;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, settings);
			}

			update(update: ViewUpdate) {
				// Only rebuild decorations if document changed
				// Use a simple debounce to avoid excessive rebuilds during rapid typing
				if (update.docChanged) {
					// For performance, we rebuild immediately for small changes
					// but could add debouncing here for very large documents
					this.decorations = buildDecorations(update.view, settings);
				} else if (update.viewportChanged) {
					// Viewport changes are less frequent, rebuild immediately
					this.decorations = buildDecorations(update.view, settings);
				}
			}

			destroy() {
				// Clean up timeout if any
				if (this.updateTimeout !== null) {
					clearTimeout(this.updateTimeout);
				}
			}
		},
		{
			decorations: (v: any) => v.decorations
		}
	);
}
