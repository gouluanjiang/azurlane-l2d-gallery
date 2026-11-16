// Small copies of the artwork for the card grid, made on this computer on first use and kept in
// .desktop-data/thumbs (never in the repository). The grid shows hundreds of 1000 x 1500 images;
// decoding those at full size is what makes scrolling and hover effects stutter.
const fs = require('node:fs');
const path = require('node:path');

const THUMB_WIDTH = 480;
const PREFIX = 'thumbs/';

// 'thumbs/assets/skins/060.jpg' -> 'assets/skins/060.jpg'; anything else is not a thumbnail request.
function thumbSource(relative) {
  if (typeof relative !== 'string' || !relative.startsWith(PREFIX)) return null;
  const source = relative.slice(PREFIX.length);
  return /^assets\/skins\/[^/\\:]+\.(?:png|jpe?g|webp)$/i.test(source) ? source : null;
}

// The cache name carries the source size and time, so a re-downloaded image gets a fresh thumbnail.
function cacheName(sourceRelative, stat) {
  const base = path.basename(sourceRelative).replace(/[^A-Za-z0-9._-]/g, '_');
  return `${base}.${stat.size}-${Math.round(stat.mtimeMs)}.jpg`;
}

class ThumbCache {
  constructor(libraryRoot, { resize } = {}) {
    this.libraryRoot = libraryRoot;
    this.folder = path.join(libraryRoot, '.desktop-data', 'thumbs');
    // Injected in tests; the app passes Electron's nativeImage.
    this.resize = resize;
    this.pending = new Map();
  }
  // Resolves to the thumbnail file for an artwork file, creating it when missing.
  // If a thumbnail cannot be made, the original image is used instead.
  async fileFor(sourceFile, sourceRelative) {
    const stat = fs.statSync(sourceFile);
    const target = path.join(this.folder, cacheName(sourceRelative, stat));
    if (fs.existsSync(target)) return target;
    if (!this.pending.has(target))
      this.pending.set(
        target,
        Promise.resolve()
          .then(() => this.resize(sourceFile, THUMB_WIDTH))
          .then(bytes => {
            if (!bytes?.length) return sourceFile;
            fs.mkdirSync(this.folder, { recursive: true });
            const temp = `${target}.${process.pid}.tmp`;
            fs.writeFileSync(temp, bytes);
            fs.renameSync(temp, target);
            this.prune(path.basename(sourceRelative), path.basename(target));
            return target;
          })
          .catch(() => sourceFile)
          .finally(() => this.pending.delete(target))
      );
    return this.pending.get(target);
  }
  // Removes older thumbnails of the same artwork.
  prune(sourceBase, keep) {
    const prefix = sourceBase.replace(/[^A-Za-z0-9._-]/g, '_') + '.';
    try {
      for (const name of fs.readdirSync(this.folder))
        if (name.startsWith(prefix) && name !== keep && name.endsWith('.jpg'))
          fs.rmSync(path.join(this.folder, name), { force: true });
    } catch {
      /* the cache is only an optimisation */
    }
  }
}

module.exports = { ThumbCache, thumbSource, cacheName, THUMB_WIDTH };
