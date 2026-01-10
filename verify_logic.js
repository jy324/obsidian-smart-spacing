
// Mock Settings
const settings = {
	removeInternalBoldSpaces: true,
	spaceBetweenChineseAndBold: true,
	spaceBetweenEnglishAndBold: false,
	spaceBetweenChineseAndItalic: true,
	skipCodeBlocks: true,
	skipInlineCode: true,
};

function processText(text, settings) {
	const lines = text.split('\n');
	const resultLines = [];
	let inCodeBlock = false;
	let inLatexBlock = false;

	for (const line of lines) {
		const trim = line.trim();
		if (settings.skipCodeBlocks && /^```|^~~~/.test(trim)) {
			inCodeBlock = !inCodeBlock;
			resultLines.push(line);
			continue;
		}
		if (/^\s*\$\$/.test(trim)) {
			if (!/^\s*\$\$.*\$\$\s*$/.test(trim) || trim === '$$') {
				inLatexBlock = !inLatexBlock;
			}
			resultLines.push(line);
			continue;
		}
		if (inCodeBlock || inLatexBlock) {
			resultLines.push(line);
			continue;
		}
		resultLines.push(processLine(line, settings));
	}
	return resultLines.join('\n');
}

function processLine(line, settings) {
	const { protectedLine, sections } = protectLine(line, settings);
	let currentLine = protectedLine;

	if (settings.removeInternalBoldSpaces) {
		currentLine = removeInternalSpaces(currentLine);
	}
	if (settings.spaceBetweenChineseAndBold || settings.spaceBetweenEnglishAndBold) {
		currentLine = fixBoldSpacing(currentLine, settings);
	}
	if (settings.spaceBetweenChineseAndItalic) {
		currentLine = fixItalicSpacing(currentLine, settings);
	}

	return restoreProtectedSections(currentLine, sections);
}

function protectLine(line, settings) {
	const sections = [];
	let protectedLine = line;
	let nextIndex = 0;

	const listMatch = /^(?:\s*)([*])(?=\s)/.exec(protectedLine);
	if (listMatch) {
		const placeholder = `__SSS_LIST_${nextIndex}__`;
		sections.push({ placeholder, original: listMatch[0] });
		protectedLine = protectedLine.replace(listMatch[0], placeholder);
		nextIndex++;
	}

	if (settings.skipInlineCode) {
		protectedLine = protectedLine.replace(/`[^`]+`/g, (match) => {
			const placeholder = `__SSS_CODE_${nextIndex++}__`;
			sections.push({ placeholder, original: match });
			return placeholder;
		});
	}

	const latexRegex = /(?<!\\)\$(?:\\.|[^$\\])*\$/g;
	protectedLine = protectedLine.replace(latexRegex, (match) => {
		const placeholder = `__SSS_LATEX_${nextIndex++}__`;
		sections.push({ placeholder, original: match });
		return placeholder;
	});

	return { protectedLine, sections };
}

function restoreProtectedSections(line, sections) {
	let result = line;
	for (let i = sections.length - 1; i >= 0; i--) {
		const { placeholder, original } = sections[i];
		result = result.replace(placeholder, original);
	}
	return result;
}

function removeInternalSpaces(line) {
	let result = '';
	let i = 0;
	const len = line.length;
	const markerStack = [];

	while (i < len) {
		if (isMarker(line, i, 3)) handleMarker(3, '***');
		else if (isMarker(line, i, 2)) handleMarker(2, '**');
		else if (isMarker(line, i, 1)) handleMarker(1, '*');
		else {
			result += line[i];
			i++;
		}
	}

	function isMarker(text, index, count) {
		if (index + count > text.length) return false;
		for (let j = 0; j < count; j++) if (text[index + j] !== '*') return false;
		if (index + count < text.length && text[index + count] === '*') return false;
		return true;
	}

	function handleMarker(count, type) {
		const lastMarker = markerStack[markerStack.length - 1];
		if (lastMarker && lastMarker.type === type) {
			while (result.length > lastMarker.startPos && /\s/.test(result[result.length - 1])) {
				result = result.slice(0, -1);
			}
			result += type;
			markerStack.pop();
			i += count;
		} else {
			result += type;
			markerStack.push({ type, startPos: result.length });
			i += count;
			while (i < len && /[ \t]/.test(line[i])) i++;
		}
	}
	return result;
}

function fixBoldSpacing(line, settings) {
	let result = '';
	let i = 0;
	let isBold = false;
	const len = line.length;

	while (i < len) {
		if (isMarker(line, i, 3)) handleBoldToken(3, '***');
		else if (isMarker(line, i, 2)) handleBoldToken(2, '**');
		else {
			result += line[i];
			i++;
		}
	}

	function isMarker(text, index, count) {
		if (index + count > text.length) return false;
		for (let j = 0; j < count; j++) if (text[index + j] !== '*') return false;
		if (index + count < text.length && text[index + count] === '*') return false;
		return true;
	}

	function handleBoldToken(count, token) {
		if (!isBold) {
			if (shouldAddSpaceBefore(result[result.length - 1], settings)) result += ' ';
			result += token;
			isBold = true;
			i += count;
		} else {
			result += token;
			isBold = false;
			i += count;
			if (shouldAddSpaceAfter(line[i], settings)) result += ' ';
		}
	}
	return result;
}

function fixItalicSpacing(line, settings) {
	let result = '';
	let i = 0;
	let isItalic = false;
	const len = line.length;

	while (i < len) {
		if (isMarker(line, i, 3)) { result += '***'; i += 3; continue; }
		if (isMarker(line, i, 2)) { result += '**'; i += 2; continue; }

		if (isMarker(line, i, 1)) {
			if (!isItalic) {
				const charBefore = result[result.length - 1];
				if (settings.spaceBetweenChineseAndItalic && isChinese(charBefore) && charBefore !== ' ') result += ' ';
				result += '*';
				isItalic = true;
				i += 1;
			} else {
				result += '*';
				isItalic = false;
				i += 1;
				const charAfter = line[i];
				if (settings.spaceBetweenChineseAndItalic && isChinese(charAfter)) result += ' ';
			}
		} else {
			result += line[i];
			i++;
		}
	}

	function isMarker(text, index, count) {
		if (index + count > text.length) return false;
		for (let j = 0; j < count; j++) if (text[index + j] !== '*') return false;
		if (index + count < text.length && text[index + count] === '*') return false;
		return true;
	}

	return result;
}

function isChinese(char) { return /[\u4e00-\u9fa5]/.test(char); }
function isAlphaNumeric(char) { return /[a-zA-Z0-9]/.test(char); }
function shouldAddSpaceBefore(char, settings) {
	if (!char || char === ' ' || char === '\t') return false;
	if (isChinese(char)) return settings.spaceBetweenChineseAndBold;
	if (isAlphaNumeric(char)) return settings.spaceBetweenEnglishAndBold;
	return false;
}
function shouldAddSpaceAfter(char, settings) {
	if (!char || char === ' ' || char === '\t' || char === '\n') return false;
	if (isChinese(char)) return settings.spaceBetweenChineseAndBold;
	if (isAlphaNumeric(char)) return settings.spaceBetweenEnglishAndBold;
	return false;
}

// TESTS
const testCases = [
	{ input: '中文**加粗**中文', expected: '中文 **加粗** 中文', desc: 'Basic bold spacing' },
	{ input: '中文*斜体*中文', expected: '中文 *斜体* 中文', desc: 'Basic italic spacing' },
	{ input: '中文***加粗斜体***中文', expected: '中文 ***加粗斜体*** 中文', desc: 'Mixed Bold/Italic' },
	{ input: '**  Content  **', expected: '**Content**', desc: 'Remove bold internal spaces' },
	{ input: 'Text `code ** bold ` Text', expected: 'Text `code ** bold ` Text', desc: 'Protect code' },
	{ input: '  * List Item', expected: '  * List Item', desc: 'Protect List Item' },
];

console.log('Running Verification Tests...');
let passed = 0;
let failed = 0;
for (const tc of testCases) {
	const res = processText(tc.input, settings);
	if (res === tc.expected) {
		passed++;
	} else {
		failed++;
		console.log(`FAIL: ${tc.desc}. Expected '${tc.expected}', Got '${res}'`);
	}
}
console.log(`Result: ${passed} passed, ${failed} failed.`);

if (failed > 0) {
	process.exit(1);
}
