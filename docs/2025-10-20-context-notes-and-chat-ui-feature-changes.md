# Context Notes & Chat UI Feature Changes

## Overview

This document describes a set of feature changes and UI improvements for the context notes and chat interface in the AI Assistant for Obsidian plugin. These changes are designed to improve usability, agent capabilities, and user awareness of context window limits.

## Feature Requirements

### 1. Context Notes Buttons

- Add three new buttons next to the agent mode buttons (matching their style):
  - **Clear context notes**
  - **Add current note to context notes**
  - **Add all open notes in the workspace to context notes**

### 2. Agent Tools for Context Notes

- Implement the above three functionalities as agent tools, so the agent can trigger them.

### 3. Clickable Links in Chat Messages

- Make links in chat messages clickable.
- Clicking a link should always open it in a new tab in the workspace.

### 4. Live/Source Mode Toggle for Chat Messages

- Add a toggle at the top of the chat UI (to the left of 'Toggle referencing current note') to switch chat message rendering between live mode and source mode.
- Live mode: formatted, interactive markdown (current behavior).
- Source mode: raw markdown/source text, like Obsidian’s note source mode.
- The toggle should clearly indicate when live mode is active.

### 5. Regeneration Button Rendering

- When a message is regenerated, it should render according to the current live/source mode toggle.
  - Live mode: formatted markdown
  - Source mode: raw markdown/source

### 6. Regeneration for User Messages

- User messages should have a regeneration button.
- Clicking it re-runs the query for that message and all messages above it (full context up to that point), just like assistant message regeneration.

### 7. Improved Delete Button UX

- When the delete button on a message is clicked:
  - Do not show a modal.
  - Change the button itself to a red "Sure" button.
  - If the user clicks "Sure," delete the message.
  - This preserves the double-check for deletion, but avoids modal clutter and only changes the button’s appearance.

### 8. Token Count Display & Context Truncation

- Display the token count (of all content to be sent to the AI, including chat messages, context notes, etc.) to the left of the model name in the chat UI.
- Check if the code already truncates messages or chat logs for context window limits.
- If not, implement truncation so only messages within the model’s context window are sent.
- Truncation should favor the most recent messages (remove oldest first).

### 9. Recently Opened Notes in System Message

- Add a toggle to 'Current Model Settings' (like 'Enable Context Notes' and 'Enable Obsidian Links') to enable/disable including the three most recently opened note paths (relative to the vault) in the system message.
- If enabled, the system message should include these three note paths during context assembly.

## Implementation Notes

- All UI changes should match the style and placement of existing agent mode buttons and toggles.
- Agent tool registration should follow the established ToolRegistry pattern.
- Token counting should use the same logic as the provider/model context window calculation.
- Truncation logic should be centralized and respect model-specific limits.
- All changes should be documented in the codebase and tested for usability.

---

_Last updated: 2025-10-20_
