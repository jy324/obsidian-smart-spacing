/**
 * CodeMirror 6 Extension for fixing bold/italic rendering in Live Preview mode
 * 
 * Problem: When Chinese characters are adjacent to **bold** or *italic* markers,
 * CodeMirror's Markdown parser fails to recognize word boundaries correctly,
 * causing the formatting not to render.
 * 
 * Solution: Use a ViewPlugin to detect unrendered bold/italic patterns and
 * apply decorations to display them correctly.
 */

import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { editorLivePreviewField } from 'obsidian';
import { PATTERNS, isProblematicBoundary } from './livePreviewLogic';

// Mock obsidian module for valid types during testing, or use specific imports
// Since we only need this for runtime check in the real plugin, we can make it optional
// or handle it differently. For now, comment it out and assume true for logic testing if needed.
// But we need to compile.

// Let's remove the direct import so tests pass in node environment
// and use a dynamic approach or interface if possible.
// For now, to unblock testing logic, we will comment out the obsidian import and the usage
// and replace with a placeholder.

// To properly fix this without breaking the build, we should separate logic from view dependency.
// But since the user wants a quick fix verification:


// Removed local definitions as they are now imported


// Removed local definitions as they are now imported

class HiddenWidget extends WidgetType {
	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.style.display = 'none';
		return span;
	}
}

/**
 * Check if the range overlaps with the current selection
 */
function isCursorInside(selection: { ranges: readonly { from: number, to: number }[] }, from: number, to: number): boolean {
	return selection.ranges.some(range => range.from <= to && range.to >= from);
}

/**
 * Check if a position is inside a syntax node that should be skipped
 */
export function shouldSkipNode(view: EditorView, from: number, to: number): boolean {
	let skip = false;
	syntaxTree(view.state).iterate({
		from,
		to,
		enter(node: { type: { name: string } }) {
			const type = node.type.name;
			// Skip if already parsed as formatting, or inside code/math blocks
			if (
				type.includes('strong') ||
				type.includes('emphasis') ||
				type.includes('code') ||
				type.includes('Code') ||
				type.includes('math') ||
				type.includes('Math') ||
				type.includes('FencedCode') ||
				type.includes('InlineCode') ||
				type === 'HyperMD-codeblock' ||
				type === 'hmd-codeblock'
			) {
				skip = true;
				return false; // stop iteration
			}
		}
	});
	return skip;
}

/**
 * Build decorations for unrendered bold/italic in the visible range
 */
function buildDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();

	// Only apply in Live Preview mode
	if (!view.state.field(editorLivePreviewField)) {
		return builder.finish();
	}

	const doc = view.state.doc;
	const selection = view.state.selection;

	for (const { from, to } of view.visibleRanges) {
		const text = doc.sliceString(from, to);
		
		const patterns = PATTERNS;

		for (const { regex, type } of patterns) {
			let match;
			regex.lastIndex = 0;
			
			while ((match = regex.exec(text)) !== null) {
				const matchStart = from + match.index;
				const matchEnd = matchStart + match[0].length;
				
				// Pattern structure:
				// match[0]: full "text"
				// match[1]: opening marker "**"
				// match[2]: content "text"
				// match[3]: closing marker "**"
				
				const openStart = matchStart;
				const openEnd = matchStart + match[1].length;
				const contentStart = openEnd;
				const contentEnd = contentStart + match[2].length;
				const closeStart = contentEnd;
				const closeEnd = matchEnd;

				// 1. Logic Check: Do we need to fix this?
				// Get characters before and after
				const charBefore = matchStart > 0 ? doc.sliceString(matchStart - 1, matchStart) : '';
				const charAfter = matchEnd < doc.length ? doc.sliceString(matchEnd, matchEnd + 1) : '';
				
				const needsFix = isProblematicBoundary(charBefore) || isProblematicBoundary(charAfter);
				if (!needsFix) continue;

				// 2. Syntax Check: Is it already parsed correctly?
				if (shouldSkipNode(view, matchStart, matchEnd)) continue;

				// 3. Interaction Check: Is cursor inside?
				// If cursor is inside/touching the range, show source (do nothing)
				// Native behavior is actually to expand when cursor touches the boundary
				if (isCursorInside(selection, matchStart, matchEnd)) continue;
				
				// 4. Apply Decorations (Make it look right)
				
				// A. Hide Opening Marker
				builder.add(
					openStart,
					openEnd,
					Decoration.replace({ widget: new HiddenWidget() })
				);

				// B. Style Content
				let exactClass = 'cm-smart-spacing-bold';
				if (type === 'italic') exactClass = 'cm-smart-spacing-italic';
				if (type === 'bold-italic') exactClass = 'cm-smart-spacing-bold-italic';

				// Also add standard CodeMirror classes for compatibility
				if (type === 'bold') exactClass += ' cm-strong';
				if (type === 'italic') exactClass += ' cm-em';
				if (type === 'bold-italic') exactClass += ' cm-strong cm-em';

				builder.add(
					contentStart,
					contentEnd,
					Decoration.mark({ class: exactClass })
				);

				// C. Hide Closing Marker
				builder.add(
					closeStart,
					closeEnd,
					Decoration.replace({ widget: new HiddenWidget() })
				);
			}
		}
	}

	return builder.finish();
}

/**
 * ViewPlugin that maintains decorations for problematic bold/italic patterns
 */
export const livePreviewExtension = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = buildDecorations(view);
		}

		update(update: ViewUpdate) {
			if (
				update.docChanged ||
				update.viewportChanged ||
				update.selectionSet
			) {
				this.decorations = buildDecorations(update.view);
			}
		}
	},
	{
		decorations: (v) => v.decorations,
	}
);
