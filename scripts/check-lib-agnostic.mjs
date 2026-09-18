#!/usr/bin/env node
// Fails when src/lib imports anything from outside the library.
// The published package has zero runtime dependencies, so every import in
// src/lib must be a relative path. Test files are skipped: they are not shipped.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/lib", import.meta.url));
// `from ...`, `import(...)`, `require(...)`, and bare side-effect `import "pkg"`.
const IMPORT_PATTERN = /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s*)["']([^"']+)["']/g;

const SOURCE_FILE_PATTERN = /\.(?:ts|tsx|js)$/;
const TEST_FILE_PATTERN = /\.test\.(?:ts|tsx|js)$/;

function collect(dir) {
    const found = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            found.push(...collect(full));
        } else if (SOURCE_FILE_PATTERN.test(entry.name) && !TEST_FILE_PATTERN.test(entry.name)) {
            found.push(full);
        }
    }
    return found;
}

const offenders = [];
for (const file of collect(root)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT_PATTERN)) {
        const specifier = match[1];
        if (specifier.startsWith("./") || specifier.startsWith("../")) continue;
        const line = source.slice(0, match.index).split("\n").length;
        const name = relative(process.cwd(), file).split(sep).join("/");
        offenders.push(`${name}:${line} imports "${specifier}"`);
    }
}

if (offenders.length > 0) {
    console.error("src/lib must stay framework-agnostic with zero runtime dependencies.");
    console.error("Non-relative imports found:");
    for (const offender of offenders) console.error(`  ${offender}`);
    process.exit(1);
}

console.log("src/lib is framework-agnostic: no external imports.");
