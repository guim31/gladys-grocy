// -----------------------------------------------------------------------------
// Small persistence under /data (the only writable path of the container): the
// products and chores the scene triggers already announced, so a restart does
// not announce them again. Losing the file is harmless: what is due at that
// moment is taken as already known, and only what becomes due afterwards is
// announced.
// (Adapted from guim31/gladys-pihole.)
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'grocy-store' });
const FILE_NAME = 'grocy-state.json';

export class Store {
  constructor(directory = process.env.GROCY_DATA_DIR || '/data') {
    this.directory = directory;
    this.path = join(directory, FILE_NAME);
    this.pending = null;
    this.writing = null;
  }

  async load() {
    try {
      const data = JSON.parse(await readFile(this.path, 'utf8'));
      return data && typeof data === 'object' ? data : {};
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`Cannot read ${this.path}: ${err.message}`);
      }
      return {};
    }
  }

  // Writes are coalesced and atomic (temporary file + rename): a crash never
  // leaves half a JSON file behind.
  save(data) {
    this.latest = data;
    if (!this.pending) {
      // Chained after the write in progress, if any: one writer at a time.
      this.pending = (this.writing ?? Promise.resolve()).then(async () => {
        const snapshot = this.latest;
        this.pending = null;
        try {
          await mkdir(this.directory, { recursive: true });
          const temporary = `${this.path}.tmp`;
          await writeFile(temporary, JSON.stringify(snapshot));
          await rename(temporary, this.path);
        } catch (err) {
          logger.warn(`Cannot write ${this.path}: ${err.message}`);
        }
      });
      this.writing = this.pending;
    }
    return this.pending;
  }

  /** Resolves once every write requested so far is on disk. */
  flush() {
    return this.writing ?? Promise.resolve();
  }
}
