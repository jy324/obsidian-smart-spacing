#!/usr/bin/env node
/**
 * Create GitHub Release with build artifacts
 * 
 * Usage: npm run github-release
 * 
 * Prerequisites:
 * - gh CLI installed and authenticated (https://cli.github.com/)
 * - Build files in build/ folder (run npm run build first)
 */

import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";

// Get version from package.json
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const version = packageJson.version;
const tagName = `${version}`;

// Check if build folder exists
if (!existsSync("build/main.js") || !existsSync("build/manifest.json")) {
    console.error("❌ Build files not found. Run 'npm run build' first.");
    process.exit(1);
}

// Check if gh CLI is available
try {
    execSync("gh --version", { stdio: "ignore" });
} catch {
    console.error("❌ GitHub CLI (gh) is not installed.");
    console.error("   Install it from: https://cli.github.com/");
    process.exit(1);
}

// Build the list of files to upload
const files = ["build/main.js", "build/manifest.json"];
if (existsSync("build/styles.css")) {
    files.push("build/styles.css");
}

const filesArg = files.join(" ");

console.log(`📦 Creating GitHub release v${version}...`);

try {
    // Create the release with files
    const cmd = `gh release create ${tagName} ${filesArg} --title "v${version}" --generate-notes`;
    console.log(`   Running: ${cmd}`);
    execSync(cmd, { stdio: "inherit" });
    console.log(`✅ Release v${version} created successfully!`);
} catch (e) {
    // Check if release already exists
    if (e.message && e.message.includes("already exists")) {
        console.log(`⚠️ Release ${tagName} already exists. Uploading assets...`);
        try {
            const uploadCmd = `gh release upload ${tagName} ${filesArg} --clobber`;
            execSync(uploadCmd, { stdio: "inherit" });
            console.log(`✅ Assets uploaded to release v${version}!`);
        } catch (uploadError) {
            console.error("❌ Failed to upload assets:", uploadError.message);
            process.exit(1);
        }
    } else {
        console.error("❌ Failed to create release:", e.message);
        process.exit(1);
    }
}
