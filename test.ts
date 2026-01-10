import { processText, SmartSpacingSettings } from './processor';
import * as fs from 'fs';

/**
 * Unit tests for Smart Spacing Plugin Logic
 * Run with: npx ts-node test.ts
 */

// ============================================================================
// Test Configuration
// ============================================================================

const defaultSettings: SmartSpacingSettings = {
    removeInternalBoldSpaces: true,
    spaceBetweenChineseAndBold: true,
    spaceBetweenEnglishAndBold: false, // Default is false for English
    spaceBetweenChineseAndItalic: true,
    skipCodeBlocks: true,
    skipInlineCode: true,
    useZeroWidthSpace: false,
};

// ============================================================================
// Test Runner
// ============================================================================

interface TestCase {
    input: string;
    expected: string;
    desc: string;
    settings?: Partial<SmartSpacingSettings>;
}

const testCases: TestCase[] = [
    // ------------------------------------------------------------------------
    // Basic Spacing
    // ------------------------------------------------------------------------
    {
        desc: 'Basic Chinese Bold Spacing',
        input: '中文**加粗**中文',
        expected: '中文 **加粗** 中文'
    },
    {
        desc: 'Basic Chinese Italic Spacing',
        input: '中文*斜体*中文',
        expected: '中文 *斜体* 中文'
    },
    {
        desc: 'Mixed Bold/Italic Spacing',
        input: '中文***加粗斜体***中文',
        expected: '中文 ***加粗斜体*** 中文'
    },

    // ------------------------------------------------------------------------
    // Internal Space Removal
    // ------------------------------------------------------------------------
    {
        desc: 'Remove internal spaces in bold',
        input: '**  Content  **',
        expected: '**Content**'
    },
    {
        desc: 'Remove internal spaces in italic',
        input: '*  Content  *',
        expected: '*Content*'
    },
    {
        desc: 'Remove internal spaces in bold+italic',
        input: '***  Content  ***',
        expected: '***Content***'
    },
    {
        desc: 'Do not remove single space if it connects words (English)',
        input: '** multiple words **',
        expected: '**multiple words**' // Current logic trims nicely
    },

    // ------------------------------------------------------------------------
    // Protection (Code, Latex, Lists)
    // ------------------------------------------------------------------------
    {
        desc: 'Protect Inline Code',
        input: 'Text `code ** bold ` Text',
        expected: 'Text `code ** bold ` Text' // No spaces added inside code
    },
    {
        desc: 'Protect LaTeX',
        input: 'Text $E=mc^2$ Text',
        expected: 'Text $E=mc^2$ Text' // No changes
    },
    {
        desc: 'Protect List Markers (Star)',
        input: '* List Item',
        expected: '* List Item' // Should NOT become italic or wrapped
    },
    {
        desc: 'Protect List Markers with indentation',
        input: '  * List Item',
        expected: '  * List Item'
    },

    // ------------------------------------------------------------------------
    // Edge Cases
    // ------------------------------------------------------------------------
    {
        desc: 'Punctuation interaction',
        input: 'End.**Bold**',
        expected: 'End.**Bold**' // No space after period usually
    },
    {
        desc: 'English interaction (Default: No space)',
        input: 'Word**Bold**Word',
        expected: 'Word**Bold**Word'
    },
    {
        desc: 'English interaction (Enabled)',
        input: 'Word**Bold**Word',
        expected: 'Word **Bold** Word',
        settings: { spaceBetweenEnglishAndBold: true }
    },
    {
        desc: 'Consecutive marks',
        input: '中文**Bold**中文**Bold**',
        expected: '中文 **Bold** 中文 **Bold**'
    },

    // ------------------------------------------------------------------------
    // Complex Integration
    // ------------------------------------------------------------------------
    {
        desc: 'Complex line with code and bold',
        input: 'Use `const x` in **TypeScript** code.',
        expected: 'Use `const x` in **TypeScript** code.' // No extra spaces needed for English default
    },
    {
        desc: 'Complex line with Chinese and code',
        input: '使用`code`进行**加粗**',
        expected: '使用`code`进行 **加粗**' // Space before bold (after Chinese char `行`)
    },
    {
        desc: 'List item with bold',
        input: '* **Bold Item**',
        expected: '* **Bold Item**' // The list star is protected. The bold is fixed.
    },
    {
        desc: 'List item with internal spaces to clean',
        input: '* **  Bold Item  **',
        expected: '* **Bold Item**'
    },
    // ------------------------------------------------------------------------
    // Bug Fixes
    // ------------------------------------------------------------------------
    {
        desc: 'Virial Theorem Bug - Inline Latex plus Block Latex',
        input: `## 维里定理

**维里定理（Virial Theorem）**是经典力学和天体物理学中一个极其优雅且强大的定理。它建立了这一类系统的**动能**（$K$）与**势能**（$U$）之间的宏观联系。

对于一个由万有引力束缚的稳定系统（如恒星、星系、星系团），维里定理最简单的形式是：

$$ 2K + U = 0 $$

这意味着：**系统的总引力势能的绝对值，是其总动能的两倍。** 或者说，动能等于负的势能的一半。`,
        expected: `## 维里定理

**维里定理（Virial Theorem）** 是经典力学和天体物理学中一个极其优雅且强大的定理。它建立了这一类系统的 **动能**（$K$）与 **势能**（$U$）之间的宏观联系。

对于一个由万有引力束缚的稳定系统（如恒星、星系、星系团），维里定理最简单的形式是：

$$ 2K + U = 0 $$

这意味着：**系统的总引力势能的绝对值，是其总动能的两倍。** 或者说，动能等于负的势能的一半。`
    }
];

function runTests() {
    let output = '';
    const log = (msg: string) => {
        console.log(msg);
        output += msg + '\n';
    };

    log('='.repeat(60));
    log('Running Smart Spacing Logic Tests');
    log('='.repeat(60));

    let passed = 0;
    let failed = 0;

    for (const tc of testCases) {
        // Merge default settings with test case specific settings
        const currentSettings = { ...defaultSettings, ...(tc.settings || {}) };

        const result = processText(tc.input, currentSettings);

        if (result === tc.expected) {
            passed++;
            log(`✅ PASS: ${tc.desc}`);
        } else {
            failed++;
            log(`❌ FAIL: ${tc.desc}`);
            log(`   Input:    "${tc.input}"`);
            log(`   Expected: "${tc.expected}"`);
            log(`   Got:      "${result}"`);
        }
    }

    log('='.repeat(60));
    log(`Results: ${passed} passed, ${failed} failed`);
    log('='.repeat(60));

    fs.writeFileSync('test_results.txt', output);

    if (failed > 0) process.exit(1);
}

runTests();
