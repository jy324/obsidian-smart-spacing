
export const PATTERNS = [
	// Bold italic: ***text***
	{
		regex: /(\*{3})([^*\n]+?)(\*{3})/g,
		type: 'bold-italic' as const
	},
	// Bold: **text**
	{
		regex: /(\*{2})([^*\n]+?)(\*{2})/g,
		type: 'bold' as const
	},
	// Italic: *text* (but not ** or ***)
	{
		regex: /(?<!\*)(\*)(?!\*)([^*\n]+?)(?<!\*)(\*)(?!\*)/g,
		type: 'italic' as const
	}
];

/**
 * Check if a character is CJK (Chinese, Japanese, Korean) or common punctuation
 * that doesn't establish word boundaries in CM's markdown parser
 */
export function isProblematicBoundary(char: string | undefined): boolean {
	if (!char) return false;
	// CJK ranges + common CJK punctuation + Smart Quotes
	// added \u201c-\u201f for smart quotes (“”‘’)
	// Added Hangul ranges: \uac00-\ud7af (Hangul Syllables), \u1100-\u11ff (Hangul Jamo)
	return /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef\u2000-\u206f\u201c-\u201f\uac00-\ud7af\u1100-\u11ff（）【】「」『』〈〉《》""''！？。，、；：]/.test(char);
}
