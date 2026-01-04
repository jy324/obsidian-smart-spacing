/**
 * Unit tests for Smart Spacing Plugin
 * Run with: npx ts-node test.ts
 */

// ============================================================================
// Test Helper Functions (copied from main.ts for standalone testing)
// ============================================================================

function shouldAddSpaceBefore(char: string): boolean {
    if (!char) return false;
    if (char === ' ' || char === '\t') return false;
    if (/[\u4e00-\u9fa5]/.test(char)) return true;
    return false;
}

function shouldAddSpaceAfter(char: string): boolean {
    if (!char) return false;
    if (char === ' ' || char === '\t' || char === '\n') return false;
    if (/[\u4e00-\u9fa5]/.test(char)) return true;
    return false;
}

function fixBoldSpacingInLine(line: string): string {
    // Protect inline code sections
    const inlineCodeRegex = /`[^`]+`/g;
    const protectedSections: { placeholder: string; original: string }[] = [];
    let protectedLine = line;
    
    let match;
    let index = 0;
    while ((match = inlineCodeRegex.exec(line)) !== null) {
        const placeholder = `\x00CODE${index}\x00`;
        protectedSections.push({ placeholder, original: match[0] });
        protectedLine = protectedLine.replace(match[0], placeholder);
        index++;
    }

    // State machine for bold markers
    let result = '';
    let i = 0;
    let isBold = false;
    const len = protectedLine.length;

    while (i < len) {
        // Check for bold marker "**" (but not "***")
        if (protectedLine[i] === '*' && protectedLine[i + 1] === '*' && protectedLine[i + 2] !== '*') {
            if (!isBold) {
                // OPENING BOLD
                const charBefore = result[result.length - 1];
                if (shouldAddSpaceBefore(charBefore)) {
                    result += ' ';
                }
                result += '**';
                isBold = true;
                i += 2;
            } else {
                // CLOSING BOLD
                result += '**';
                isBold = false;
                i += 2;
                const charAfter = protectedLine[i];
                if (shouldAddSpaceAfter(charAfter)) {
                    result += ' ';
                }
            }
        } 
        // Handle "***" as bold+italic
        else if (protectedLine[i] === '*' && protectedLine[i + 1] === '*' && protectedLine[i + 2] === '*') {
            if (!isBold) {
                const charBefore = result[result.length - 1];
                if (shouldAddSpaceBefore(charBefore)) {
                    result += ' ';
                }
                result += '***';
                isBold = true;
                i += 3;
            } else {
                result += '***';
                isBold = false;
                i += 3;
                const charAfter = protectedLine[i];
                if (shouldAddSpaceAfter(charAfter)) {
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
    for (const { placeholder, original } of protectedSections) {
        result = result.replace(placeholder, original);
    }

    return result;
}

// ============================================================================
// Test Cases
// ============================================================================

const testCases = [
    // Basic cases
    { input: '中文**加粗**中文', expected: '中文 **加粗** 中文', desc: 'Basic bold spacing' },
    { input: '中文 **加粗** 中文', expected: '中文 **加粗** 中文', desc: 'Already has spaces' },
    { input: '中文**加粗**', expected: '中文 **加粗**', desc: 'Bold at end' },
    { input: '**加粗**中文', expected: '**加粗** 中文', desc: 'Bold at start' },
    
    // Multiple bold
    { input: '中文**加粗**和**另一个**中文', expected: '中文 **加粗** 和 **另一个** 中文', desc: 'Multiple bold' },
    
    // Edge cases - NO internal spaces
    { input: '**加粗内容**', expected: '**加粗内容**', desc: 'No modification when no adjacent Chinese' },
    
    // Mixed content
    { input: '这是**bold**文本和**另一个**测试', expected: '这是 **bold** 文本和 **另一个** 测试', desc: 'Mixed Chinese-English in bold' },
    
    // Inline code protection
    { input: '中文`code**不处理**`中文', expected: '中文`code**不处理**`中文', desc: 'Inline code should be protected' },
    
    // Punctuation (should NOT add space before punctuation)
    { input: '中文**加粗**，继续', expected: '中文 **加粗**，继续', desc: 'No space before Chinese punctuation' },
    { input: '中文**加粗**。结束', expected: '中文 **加粗**。结束', desc: 'No space before period' },
    
    // English adjacent (should NOT add space by default for English)
    { input: 'English**bold**text', expected: 'English**bold**text', desc: 'No space for English by default' },
    
    // Bold with stars inside content - edge case
    { input: '中文**2*3=6**中文', expected: '中文 **2*3=6** 中文', desc: 'Stars inside bold content' },
    
    // Triple star (bold+italic)
    { input: '中文***粗斜***中文', expected: '中文 ***粗斜*** 中文', desc: 'Bold+italic handling' },
];

// ============================================================================
// Run Tests
// ============================================================================

console.debug('='.repeat(60));
console.debug('Smart Spacing Plugin - Unit Tests');
console.debug('='.repeat(60));

let passed = 0;
let failed = 0;

for (const tc of testCases) {
    const result = fixBoldSpacingInLine(tc.input);
    const success = result === tc.expected;
    
    if (success) {
        passed++;
        console.debug(`✅ PASS: ${tc.desc}`);
    } else {
        failed++;
        console.debug(`❌ FAIL: ${tc.desc}`);
        console.debug(`   Input:    "${tc.input}"`);
        console.debug(`   Expected: "${tc.expected}"`);
        console.debug(`   Got:      "${result}"`);
    }
}

console.debug('='.repeat(60));
console.debug(`Results: ${passed} passed, ${failed} failed`);
console.debug('='.repeat(60));
