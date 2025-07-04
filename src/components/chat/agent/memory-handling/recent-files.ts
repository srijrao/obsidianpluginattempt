import type { VectorStore } from './vectorStore';



/**
 * Adds or updates a recent file entry with the current timestamp using the provided VectorStore.
 * @param vectorStore - The VectorStore instance.
 * @param filePath - The file path to record as recently opened.
 */
export function addRecentFile(vectorStore: VectorStore, filePath: string): void {
  const db = vectorStore.getDB();
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO recent_files (path, last_opened) VALUES (?, ?);'
  );
  stmt.run(filePath, Date.now());
}

/**
 * Retrieves a list of recently opened files, ordered by most recent, using the provided VectorStore.
 * @param vectorStore - The VectorStore instance.
 * @param limit - Maximum number of files to return (default: 20).
 * @returns Array of objects: { path, last_opened }
 */
export function getRecentFiles(vectorStore: VectorStore, limit: number = 20): { path: string; last_opened: number }[] {
  const db = vectorStore.getDB();
  const stmt = db.prepare(
    'SELECT path, last_opened FROM recent_files ORDER BY last_opened DESC LIMIT ?;'
  );
  return stmt.all(limit) as Array<{ path: string; last_opened: number }>;
}
