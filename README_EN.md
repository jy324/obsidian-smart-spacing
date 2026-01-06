# Obsidian Smart Spacing Plugin

An Obsidian plugin focused on handling **bold/italic** spacing issues, designed as a **complement to the Linter plugin**.

## Why This Plugin?

The Linter plugin uses regular expressions to handle spacing, but regex cannot correctly distinguish whether `**` is an opening or closing marker, which leads to:
- Incorrectly adding spaces inside bold text: `**text**` → `** text **` (rendering fails)
- Cannot fix existing internal spacing issues

This plugin uses a **state machine algorithm** to handle all bold/italic scenarios with 100% accuracy.

## Features

### ✅ What This Plugin Handles (What Linter Can't)

| Feature | Effect |
|---------|--------|
| Remove internal bold spaces | `** text **` → `**text**` |
| Remove internal italic spaces | `* text *` → `*text*` |
| Add space between Chinese and bold | `中文**加粗**` → `中文 **加粗**` |
| Add space between Chinese and italic | `中文*斜体*` → `中文 *斜体*` |

### ❌ Leave to Linter

- Spaces between Chinese and English
- Spaces between Chinese and numbers
- Other Markdown formatting

## Use with Linter ⭐

### Configuration Steps

1. Install and enable this plugin
2. Open Linter settings
3. Find **Custom Commands** option
4. Add command:
   ```
   Smart Spacing for Chinese: Fix all spacing (Chinese/Bold/Italic)
   ```
5. Now Linter will automatically call this plugin during formatting

### Recommended Linter Settings

Disable any bold-related regex rules in Linter (if any) and let this plugin handle all bold spacing.

## Available Commands

| Command | Description |
|---------|-------------|
| `Fix all spacing (Chinese/Bold/Italic)` | Fix all bold/italic spacing issues |
| `Fix bold spacing only` | Fix only bold-related issues |
| `Fix all spacing (silent)` | Silent fix without notifications (for automation) |

## Settings

| Option | Default | Description |
|--------|---------|-------------|
| Remove internal bold/italic spaces | ✅ | `** text **` → `**text**` |
| Add space between Chinese and bold | ✅ | `中文**加粗**` → `中文 **加粗**` |
| Add space between English and bold | ❌ | Usually not needed |
| Add space between Chinese and italic | ✅ | `中文*斜体*` → `中文 *斜体*` |
| Skip code blocks | ✅ | Protect content inside ``` |
| Skip inline code | ✅ | Protect content inside \`code\` |
| Enable live preview formatting (Experimental) | ❌ | Show real-time spacing hints in live preview mode |

### 🎨 Live Preview Mode (Experimental)

When enabled, visual hints will appear in live preview mode to show where spaces should be added, without modifying the source text. This helps:
- See formatting suggestions in real-time
- Understand what needs adjustment while editing
- No impact on source until you manually run format commands

**Note**: After enabling, you need to reopen files for the changes to take effect.

## Installation

### Manual Installation

```bash
cd .obsidian/plugins/obsidian-smart-spacing
npm install
npm run build
```

Restart Obsidian and enable the plugin in settings.

## Technical Implementation

This plugin uses a **state machine** instead of regular expressions:

```
When encountering **:
  If not currently in bold state → This is an opening marker → Check if space is needed before
  If currently in bold state     → This is a closing marker → Check if space is needed after
```

This ensures:
1. Never adds spaces inside `**`
2. Correctly handles complex cases like consecutive bold, nested formatting, etc.

## License

MIT
