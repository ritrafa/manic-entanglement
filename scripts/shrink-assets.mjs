// One-shot asset diet (run once, commit the result): re-encodes the listed
// public images at most at the given width and JPEG quality. It never
// enlarges — a file already at or below the target width is left untouched —
// so running it twice is safe and changes nothing the second time.
import { fileURLToPath } from 'node:url';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));

/** The images the asset diet covers. */
const TARGETS = [
    { file: 'images/galaxy2.jpg', width: 1280, quality: 72 },
];

for (const target of TARGETS) {
    const path = join(PUBLIC_DIR, target.file);
    let metadata;
    try {
        metadata = await sharp(path).metadata();
    } catch (error) {
        console.error(`shrink-assets: cannot read ${target.file}: ${error.message}`);
        process.exitCode = 1;
        continue;
    }
    const width = metadata.width ?? 0;
    if (width <= target.width) {
        console.log(`shrink-assets: ${target.file} is ${width}px wide, at or under ${target.width}px: untouched`);
        continue;
    }
    // Encode beside the original and rename, so a crash never truncates the
    // source picture mid-write.
    const temporary = `${path}.shrinking`;
    const info = await sharp(path)
        .resize({ width: target.width, withoutEnlargement: true })
        .jpeg({ quality: target.quality })
        .toFile(temporary);
    await rename(temporary, path);
    console.log(
        `shrink-assets: ${target.file} ${width}px -> ${info.width}px, ` +
        `${(info.size / 1024).toFixed(0)} kB at quality ${target.quality}`,
    );
}
