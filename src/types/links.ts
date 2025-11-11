/**
 * Types for link resolution and metadata tracking in Obsidian links processing.
 */

/**
 * Result of processing Obsidian links in content.
 */
export interface LinkResolutionResult {
  /** The processed content with links expanded or marked as unresolved */
  content: string;
  /** Array of resolved note paths that were successfully expanded */
  resolved: string[];
  /** Array of unresolved link references that couldn't be found */
  unresolved: string[];
}

/**
 * Metadata about a single link resolution attempt.
 */
export interface LinkMetadata {
  /** The original link text (e.g., "[[Note Name]]") */
  originalLink: string;
  /** The resolved canonical path if found, null if not found */
  resolvedPath: string | null;
  /** Whether this link was expanded (content included) or just tracked */
  wasExpanded: boolean;
}