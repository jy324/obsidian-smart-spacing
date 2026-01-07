
import { PATTERNS, isProblematicBoundary } from './livePreviewLogic.ts';

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

function runTest(name: string, testFn: () => void) {
    try {
        testFn();
        console.log(`✅ ${name}`);
    } catch (e: any) {
        console.error(`❌ ${name}: ${e.message}`);
    }
}

console.log('Running Edge Case Tests...');

// Mock the detection logic used in buildDecorations
// We can't mock the full EditorView/SyntaxTree here easily, but we can verify
// the core decision logic: Regex Match + Boundary Check.

const checkLogic = (text: string, contextBefore: string, contextAfter: string) => {
    // 1. Regex Matching
    let matched = false;
    let content = '';
    
    // Test Bold Pattern
    const pattern = PATTERNS.find(p => p.type === 'bold');
    if (pattern) {
        pattern.regex.lastIndex = 0;
        const match = pattern.regex.exec(text);
        if (match) {
            matched = true;
            content = match[2];
        }
    }
    
    if (!matched) return 'NO_REGEX_MATCH';

    // 2. Boundary Check
    const needsFix = isProblematicBoundary(contextBefore) || isProblematicBoundary(contextAfter);
    
    if (!needsFix) return 'SKIPPED_BOUNDARY';
    
    return 'FIXED';
};

runTest('Edge Case: Chinese Word char + Quote inside bold', () => {
    // Case: 区分**“违法”**
    // Text: **“违法”**
    // Before: 分
    // After: （Empty or next char)
    
    const text = '**“违法”**';
    const before = '分';
    const after = '';
    
    const result = checkLogic(text, before, after);
    assert(result === 'FIXED', `Should be FIXED. Got: ${result}`);
});

runTest('Edge Case: English Word char + Quote inside bold (Current implementation limitation?)', () => {
    // Case: word**"quote"**
    // Before: d
    // After: ''
    // NOTE: Current logic relies on CJK/Punctuation boundary. 
    // 'd' is not problematic boundary. So this might return SKIPPED_BOUNDARY.
    // This confirms if my current implementation handles the GENERIC case or just the PROMPTED CJK case.
    
    const text = '**"quote"**';
    const before = 'd';
    const after = '';
    
    const result = checkLogic(text, before, after);
    console.log(`   English case result: ${result} (Expected: SKIPPED_BOUNDARY with current logic)`);
});
