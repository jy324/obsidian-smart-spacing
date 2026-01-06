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

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex];
		
		// Skip empty lines
		if (line.trim().length === 0) {
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
 */
function getLineDecorations(line: string, lineStart: number, settings: SmartSpacingSettings): DecorationInfo[] {
	const decorations: DecorationInfo[] = [];
	
	// Simple state machine to track bold/italic markers
	let i = 0;
	const len = line.length;
	let isBold = false;
	let isItalic = false;

	while (i < len) {
		// Check for bold markers (**)
		if (i + 1 < len && line[i] === '*' && line[i + 1] === '*') {
			// Check if this is actually *** (bold+italic)
			if (i + 2 < len && line[i + 2] === '*') {
				// Handle *** marker
				if (!isBold) {
					// Opening ***
					const charBefore = i > 0 ? line[i - 1] : '';
					if (shouldAddSpaceBefore(charBefore, settings)) {
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
				if (shouldAddSpaceBefore(charBefore, settings)) {
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
				if (shouldAddSpaceAfter(charAfter, settings)) {
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
				if (settings.spaceBetweenChineseAndItalic && isChinese(charBefore) && charBefore !== ' ') {
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
				if (settings.spaceBetweenChineseAndItalic && isChinese(charAfter)) {
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

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, settings);
			}

			update(update: ViewUpdate) {
				// Rebuild decorations if document changed
				if (update.docChanged || update.viewportChanged) {
					this.decorations = buildDecorations(update.view, settings);
				}
			}
		},
		{
			decorations: (v: any) => v.decorations
		}
	);
}
