/**
 * Core text processing logic for Smart Spacing Plugin
 */

/**
 * Settings interface for the text processor
 */
export interface SmartSpacingSettings {
	removeInternalBoldSpaces: boolean;
	spaceBetweenChineseAndBold: boolean;
	spaceBetweenEnglishAndBold: boolean;
	spaceBetweenChineseAndItalic: boolean;
	skipCodeBlocks: boolean;
	skipInlineCode: boolean;
	useZeroWidthSpace: boolean;
	removeFirstLineIndent: boolean;
}

/**
 * Represents a protected section of text that should not be modified
 */
interface ProtectedSection {
	placeholder: string;
	original: string;
}

/**
 * Main entry point for processing text
 */
export function processText(text: string, settings: SmartSpacingSettings): string {
	const lines = text.split('\n');
	const resultLines: string[] = [];
	let inCodeBlock = false;
	let inLatexBlock = false;
	let inFrontmatter = false;
	let lineIndex = 0;

	for (const line of lines) {
		const trim = line.trim();

		// YAML frontmatter detection (must start at line 0)
		if (lineIndex === 0 && trim === '---') {
			inFrontmatter = true;
			resultLines.push(line);
			lineIndex++;
			continue;
		}
		if (inFrontmatter) {
			resultLines.push(line);
			if (trim === '---') {
				inFrontmatter = false;
			}
			lineIndex++;
			continue;
		}

		// Always track code block boundaries for correct state (Issue #2)
		const isCodeFence = /^```|^~~~/.test(trim);
		if (isCodeFence) {
			inCodeBlock = !inCodeBlock;
			resultLines.push(line);
			lineIndex++;
			continue;
		}

		// Handle LaTeX Blocks ($$)
		if (/^\$\$/.test(trim)) {
			// Single line $$ ... $$ (e.g. $$ E=mc^2 $$) vs block delimiter
			if (!/^\$\$.*\$\$$/.test(trim) || trim === '$$') {
				inLatexBlock = !inLatexBlock;
			}
			resultLines.push(line);
			lineIndex++;
			continue;
		}

		// If inside a protected block, preserve line as is
		if ((inCodeBlock && settings.skipCodeBlocks) || inLatexBlock) {
			resultLines.push(line);
			lineIndex++;
			continue;
		}

		// If inside a code block but skipCodeBlocks is off, still skip processing
		// to avoid corrupting code content
		if (inCodeBlock) {
			resultLines.push(line);
			lineIndex++;
			continue;
		}

		let processedLine = line;

		// Remove first-line indent (before other processing)
		if (settings.removeFirstLineIndent) {
			processedLine = removeLineIndent(processedLine);
		}

		// Process the line (bold/italic spacing)
		resultLines.push(processLine(processedLine, settings));
		lineIndex++;
	}

	return resultLines.join('\n');
}

/**
 * Process a single line by applying protections, running fixers, and restoring protections
 */
function processLine(line: string, settings: SmartSpacingSettings): string {
	// 1. Protect sensitive content (inline code, latex, lists)
	const { protectedLine, sections } = protectLine(line, settings);
	let currentLine = protectedLine;

	// 2. Remove internal spaces (e.g. "**  text  **" -> "**text**")
	if (settings.removeInternalBoldSpaces) {
		currentLine = removeInternalSpaces(currentLine);
	}

	// 3. Fix bold spacing (e.g. "中文**bold**" -> "中文 **bold**")
	if (settings.spaceBetweenChineseAndBold || settings.spaceBetweenEnglishAndBold) {
		currentLine = fixBoldSpacing(currentLine, settings);
	}

	// 4. Fix italic spacing (e.g. "中文*italic*" -> "中文 *italic*")
	if (settings.spaceBetweenChineseAndItalic) {
		currentLine = fixItalicSpacing(currentLine, settings);
	}

	// 5. Restore protected sections
	return restoreProtectedSections(currentLine, sections);
}

/**
 * Protect sensitive sections (Lists, Formulas, Inline Code)
 */
function protectLine(line: string, settings: SmartSpacingSettings): { protectedLine: string, sections: ProtectedSection[] } {
	const sections: ProtectedSection[] = [];
	let protectedLine = line;
	let nextIndex = 0;

	// 1. Protect List Markers (e.g. "  * ") - Only the asterisk itself
	const listMatch = /^(?:\s*)([*])(?=\s)/.exec(protectedLine);
	if (listMatch) {
		const placeholder = `__SSS_LIST_${nextIndex}__`;
		// listMatch[1] captures the '*', listMatch[0] captures whitespace+*, but we only want to protect the '*' to avoid messing up indentation logic if we ever touch it. 
		// Actually the original logic replaced listMatch[0]. Let's stick to original behavior to be safe, but review:
		// original: /^(?:\s*)([*])(?=\s)/ captures the asterisk in group 1. But exec returns match array where [0] is the whole match.
		// The original logic replaced match[0].
		// Example: "  * Item". Match: "  *". Replaced by placeholder.
		// Result: "PLACEHOLDER Item".
		// This protects the indentation and the bullet. Correct.
		sections.push({ placeholder, original: listMatch[0] });
		protectedLine = protectedLine.replace(listMatch[0], placeholder);
		nextIndex++;
	}

	// 2. Protect Inline Code — supports multi-backtick delimiters per CommonMark spec
	// e.g. `code`, ``code with `backtick` inside``, etc.
	if (settings.skipInlineCode) {
		protectedLine = protectedLine.replace(/(``+)(?!`)([\s\S]*?)\1(?!`)/g, (match) => {
			const placeholder = `__SSS_CODE_${nextIndex++}__`;
			sections.push({ placeholder, original: match });
			return placeholder;
		});
	}

	// 3. Protect Inline LaTeX ($ not preceded by \)
	const latexRegex = /(?<!\\)\$(?:\\.|[^$\\])*\$/g;
	protectedLine = protectedLine.replace(latexRegex, (match) => {
		// Avoid double protection if it somehow overlaps (unlikely with replace)
		const placeholder = `__SSS_LATEX_${nextIndex++}__`;
		sections.push({ placeholder, original: match });
		return placeholder;
	});

	return { protectedLine, sections };
}

function restoreProtectedSections(line: string, sections: ProtectedSection[]): string {
	let result = line;
	// Restore in reverse order to handle nesting if any (though we try to avoid nesting)
	for (let i = sections.length - 1; i >= 0; i--) {
		const { placeholder, original } = sections[i];
		result = result.replace(placeholder, original);
	}
	return result;
}

/**
 * State machine to clean bold/italic internal spaces
 * **  text  ** -> **text**
 */
function removeInternalSpaces(line: string): string {
	let result = '';
	let i = 0;
	const len = line.length;
	// Stack for markers: type ('*', '**', '***') and startPos in 'result'
	const markerStack: { type: string; startPos: number }[] = [];

	while (i < len) {
		// Three stars ***
		if (isMarker(line, i, 3)) {
			handleMarker(3, '***');
		}
		// Two stars **
		else if (isMarker(line, i, 2)) {
			handleMarker(2, '**');
		}
		// One star *
		else if (isMarker(line, i, 1)) {
			handleMarker(1, '*');
		}
		else {
			result += line[i];
			i++;
		}
	}

	function isMarker(text: string, index: number, count: number): boolean {
		if (index + count > text.length) return false;
		for (let j = 0; j < count; j++) {
			if (text[index + j] !== '*') return false;
		}
		// Ensure it's exactly 'count' stars (not part of a larger set if we already checked larger sets)
		// processed in order (3, 2, 1) so if we matched 3, we consumed it.
		// But if we are checking 2, and it is 3, we should have already caught it?
		// Yes, the main loop order matters.
		// However, we need to make sure we don't match '**' inside '***' if we didn't check '***' first? 
		// We do check '***' first.
		// Check that the character AFTER is not a star?
		if (index + count < text.length && text[index + count] === '*') return false;
		return true;
	}

	function handleMarker(count: number, type: string) {
		const lastMarker = markerStack[markerStack.length - 1];
		if (lastMarker && lastMarker.type === type) {
			// Closing marker
			// Trim trailing spaces in 'result' before appending closing marker
			while (result.length > lastMarker.startPos && /\s/.test(result[result.length - 1])) {
				result = result.slice(0, -1);
			}
			result += type;
			markerStack.pop();
			i += count;
		} else {
			// Opening marker
			result += type;
			markerStack.push({ type, startPos: result.length }); // startPos is right after marker
			i += count;
			// Skip spaces after opening marker
			while (i < len && /[ \t]/.test(line[i])) { // Only skip spaces/tabs, not newlines (though line shouldn't have newlines)
				i++;
			}
		}
	}

	return result;
}


/**
 * Fix spaces around Bold (**...**)
 */
function fixBoldSpacing(line: string, settings: SmartSpacingSettings): string {
	let result = '';
	let i = 0;
	let isBold = false;
	const len = line.length;
	const spaceChar = getSpaceChar(settings);

	while (i < len) {
		// Check for *** (treated as bold for spacing purposes initially, or logic split?)
		// Original code treated *** as "toggle bold" in the bold-spacer.
		// Let's replicate original behavior: treating *** as a token that toggles 'isBold'.

		if (isMarker(line, i, 3)) {
			handleBoldToken(3, '***');
		} else if (isMarker(line, i, 2)) {
			handleBoldToken(2, '**');
		} else {
			result += line[i];
			i++;
		}
	}

	function isMarker(text: string, index: number, count: number): boolean {
		if (index + count > text.length) return false;
		for (let j = 0; j < count; j++) if (text[index + j] !== '*') return false;
		if (index + count < text.length && text[index + count] === '*') return false;
		return true;
	}

	function handleBoldToken(count: number, token: string) {
		if (!isBold) {
			// Opening
			if (shouldAddSpaceBefore(result[result.length - 1], settings)) {
				result += spaceChar;
			}
			result += token;
			isBold = true;
			i += count;
		} else {
			// Closing
			result += token;
			isBold = false;
			i += count;
			if (shouldAddSpaceAfter(line[i], settings)) {
				result += spaceChar;
			}
		}
	}

	return result;
}

/**
 * Fix spaces around Italic (*...*)
 */
function fixItalicSpacing(line: string, settings: SmartSpacingSettings): string {
	// We need to protect BOLD markers inside this function so they aren't confused for italic markers.
	// But we can't use \x00 characters that look like placeholders from earlier?
	// We can use a unique placeholder for BOLD protection just for this step.
	// OR, we can just skip over them in the loop.

	let result = '';
	let i = 0;
	let isItalic = false;
	const len = line.length;
	const spaceChar = getSpaceChar(settings);

	while (i < len) {
		// Pass through bold markers (*** or **) without processing them as italic *
		if (isMarker(line, i, 3)) {
			result += '***';
			i += 3;
			continue;
		}
		if (isMarker(line, i, 2)) {
			result += '**';
			i += 2;
			continue;
		}

		// Italic Marker *
		if (isMarker(line, i, 1)) {
			if (!isItalic) {
				// Opening
				// Check char before
				const charBefore = result[result.length - 1];
				if (settings.spaceBetweenChineseAndItalic && isChinese(charBefore) && charBefore !== ' ' && charBefore !== '\u200B') {
					result += spaceChar;
				}
				result += '*';
				isItalic = true;
				i += 1;
			} else {
				// Closing
				result += '*';
				isItalic = false;
				i += 1;
				// Check char after
				const charAfter = line[i];
				if (settings.spaceBetweenChineseAndItalic && isChinese(charAfter)) {
					result += spaceChar;
				}
			}
		} else {
			result += line[i];
			i++;
		}
	}

	function isMarker(text: string, index: number, count: number): boolean {
		if (index + count > text.length) return false;
		for (let j = 0; j < count; j++) if (text[index + j] !== '*') return false;
		if (index + count < text.length && text[index + count] === '*') return false;
		return true;
	}

	return result;
}


// ============================================================================
// Remove First-Line Indent
// ============================================================================

/**
 * Remove leading indent from a line if it contains full-width spaces or starts with CJK.
 * Preserves structural Markdown elements (lists, blockquotes, headings, tables, etc.)
 */
function removeLineIndent(line: string): string {
	const trimmed = line.trimStart();
	const indent = line.slice(0, line.length - trimmed.length);

	// Preserve structural Markdown elements
	if (/^[*\-+]\s|^\d+\.\s|^>\s|^#+\s|^\||\-{3,}|^\*{3,}|^<|^:\s/.test(trimmed)) {
		return line;
	}

	// Only strip if indent contains full-width space (\u3000) OR trimmed line starts with CJK
	const hasFullWidthSpace = /\u3000/.test(indent);
	const startsWithCJK = trimmed.length > 0 && isChinese(trimmed[0]);

	if (hasFullWidthSpace || startsWithCJK) {
		return trimmed;
	}

	return line;
}

/**
 * Pre-scan a line to find valid (properly paired) marker positions.
 * Returns a Set of character indices that are part of valid opening/closing marker pairs.
 */
function findValidMarkerPairs(line: string): Set<number> {
	const validPositions = new Set<number>();
	const stack: { type: string; pos: number }[] = [];
	let i = 0;

	while (i < line.length) {
		if (isMarker(line, i, 3)) {
			const top = stack[stack.length - 1];
			if (top && top.type === '***') {
				validPositions.add(top.pos);
				validPositions.add(i);
				stack.pop();
			} else {
				stack.push({ type: '***', pos: i });
			}
			i += 3;
		} else if (isMarker(line, i, 2)) {
			const top = stack[stack.length - 1];
			if (top && top.type === '**') {
				validPositions.add(top.pos);
				validPositions.add(i);
				stack.pop();
			} else {
				stack.push({ type: '**', pos: i });
			}
			i += 2;
		} else if (isMarker(line, i, 1)) {
			const top = stack[stack.length - 1];
			if (top && top.type === '*') {
				validPositions.add(top.pos);
				validPositions.add(i);
				stack.pop();
			} else {
				stack.push({ type: '*', pos: i });
			}
			i += 1;
		} else {
			i++;
		}
	}

	return validPositions;
}

/**
 * Module-level isMarker helper (extracted from nested definitions)
 */
function isMarker(text: string, index: number, count: number): boolean {
	if (index + count > text.length) return false;
	for (let j = 0; j < count; j++) {
		if (text[index + j] !== '*') return false;
	}
	// Ensure not part of a longer run of stars
	if (index + count < text.length && text[index + count] === '*') return false;
	return true;
}


// ============================================================================
// Helpers
// ============================================================================

/**
 * Get the space character based on settings
 * Returns zero-width space (\u200B) or regular space
 */
function getSpaceChar(settings: SmartSpacingSettings): string {
	return settings.useZeroWidthSpace ? '\u200B' : ' ';
}

function isChinese(char: string): boolean {
	// Uses Unicode property escape to cover all CJK Unified Ideographs (Extensions A-G)
	return /\p{Unified_Ideograph}/u.test(char);
}

function isAlphaNumeric(char: string): boolean {
	return /[a-zA-Z0-9]/.test(char);
}

function shouldAddSpaceBefore(char: string, settings: SmartSpacingSettings): boolean {
	if (!char || char === ' ' || char === '\t' || char === '\u200B') return false;
	if (isChinese(char)) return settings.spaceBetweenChineseAndBold;
	if (isAlphaNumeric(char)) return settings.spaceBetweenEnglishAndBold;
	return false;
}

function shouldAddSpaceAfter(char: string, settings: SmartSpacingSettings): boolean {
	if (!char || char === ' ' || char === '\t' || char === '\n' || char === '\u200B') return false;
	if (isChinese(char)) return settings.spaceBetweenChineseAndBold;
	if (isAlphaNumeric(char)) return settings.spaceBetweenEnglishAndBold;
	return false;
}
