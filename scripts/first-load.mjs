// First-load budget: reads the prerendered page (.next/server/app/index.html,
// written by `next build`), sums the sizes of the distinct /_next/static/...js
// files it references, prints the total in kB, and exits 1 when the total is
// above the number given as --max-kb.
//
//   node scripts/first-load.mjs [--max-kb 800]
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HTML_FILE = join(ROOT, '.next', 'server', 'app', 'index.html');
/** A /_next/... URL lives under .next with the /_next prefix replaced. */
const toDiskPath = (url) => join(ROOT, '.next', url.slice('/_next'.length));

function readMaxKb(argv) {
    const inline = argv.find((arg) => arg.startsWith('--max-kb='));
    if (inline !== undefined) return Number(inline.slice('--max-kb='.length));
    const index = argv.indexOf('--max-kb');
    if (index !== -1) {
        const value = argv[index + 1];
        if (value === undefined) {
            console.error('first-load: --max-kb needs a number, e.g. --max-kb 800');
            process.exit(1);
        }
        return Number(value);
    }
    return null;
}

const maxKb = readMaxKb(process.argv.slice(2));
if (maxKb !== null && !Number.isFinite(maxKb)) {
    console.error(`first-load: --max-kb wants a number, got "${maxKb}"`);
    process.exit(1);
}

let html;
try {
    html = readFileSync(HTML_FILE, 'utf8');
} catch {
    console.error(
        `first-load: cannot read ${HTML_FILE}.\n` +
        'Build the app first: npm run build',
    );
    process.exit(1);
}

const urls = [...new Set(html.match(/\/_next\/static\/[^"'()\s]+\.js/g) ?? [])];
let totalBytes = 0;
for (const url of urls) {
    try {
        totalBytes += statSync(toDiskPath(url)).size;
    } catch {
        console.error(`first-load: the page references ${url} but ${toDiskPath(url)} is missing.\nBuild the app first: npm run build`);
        process.exit(1);
    }
}

const totalKb = totalBytes / 1024;
console.log(`first-load: ${urls.length} script files, ${totalKb.toFixed(1)} kB of uncompressed JavaScript`);
if (maxKb !== null) {
    console.log(`first-load: budget ${maxKb} kB — ${totalKb > maxKb ? 'OVER' : 'under'}`);
    if (totalKb > maxKb) process.exit(1);
}
