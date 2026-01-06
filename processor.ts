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

	for (const line of lines) {
		const trim = line.trim();

		// Handle Code Blocks (``` or ~~~)
		if (settings.skipCodeBlocks && /^```|^~~~/.test(trim)) {
			inCodeBlock = !inCodeBlock;
			resultLines.push(line);
			continue;
		}

		// Handle LaTeX Blocks ($$)
		if (/^\s*\$\$/.test(trim)) {
			// Check for single line $$ ... $$ (e.g. $$ E=mc^2 $$)
			// If not single line, toggle block state
			if (!/^\s*\$\$.*\$\$\s*$/.test(trim) || trim === '$$') {
				inLatexBlock = !inLatexBlock;
			}
			resultLines.push(line);
			continue;
		}

		// If inside a block, preserve line as is
		if (inCodeBlock || inLatexBlock) {
			resultLines.push(line);
			continue;
		}

		// Process the line
		resultLines.push(processLine(line, settings));
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
		const placeholder = `\x00LIST${nextIndex}\x00`;
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

	// 2. Protect Inline Code (`code`)
	if (settings.skipInlineCode) {
		const inlineCodeRegex = /`[^`]+`/g;
		let match;
		// Reset regex state if reused (not needed for local var but good practice if moved out)
		while ((match = inlineCodeRegex.exec(protectedLine)) !== null) {
			const placeholder = `\x00CODE${nextIndex}\x00`;
			sections.push({ placeholder, original: match[0] });
			protectedLine = protectedLine.replace(match[0], placeholder);
			// Reset index to avoid infinite loop if replacement is shorter/longer (replace only replaces first occurrence, but we are looping on modified string? No, exec loop on modified string is tricky.)
			// BETTER: Use a replace callback or split/join.
			// Current safe approach: replace matches one by one. But modifying the string while exec-ing on it is dangerous if indices shift.
			// Standard approach for robust replacement:
			// Let's use a specialized tokenization or just replace carefully.
			// Since we use unique placeholders that won't match the regex, we can continue.
			// However, simple loop:
		}
		// RERUN loop safely:
		// Actually, `replace` with a callback is much safer and faster.
		protectedLine = protectedLine.replace(/`[^`]+`/g, (match) => {
			const placeholder = `\x00CODE${nextIndex++}\x00`;
			sections.push({ placeholder, original: match });
			return placeholder;
		});
	}

	// 3. Protect Inline LaTeX ($ not preceded by \)
	const latexRegex = /(?<!\\)\$(?:\\.|[^$\\])*\$/g;
	protectedLine = protectedLine.replace(latexRegex, (match) => {
		// Avoid double protection if it somehow overlaps (unlikely with replace)
		const placeholder = `\x00LATEX${nextIndex++}\x00`;
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
				result += ' ';
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
				result += ' ';
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
				if (settings.spaceBetweenChineseAndItalic && isChinese(charBefore) && charBefore !== ' ') {
					result += ' ';
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
					result += ' ';
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
// Helpers
// ============================================================================

function isChinese(char: string): boolean {
	return /[\u4e00-\u9fa5]/.test(char);
}

function isAlphaNumeric(char: string): boolean {
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
