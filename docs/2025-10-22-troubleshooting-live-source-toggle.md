# Troubleshooting Live/Source View Toggle in AI Assistant Chat UI

## Overview

The AI Assistant plugin provides two render modes for chat messages: **Live** (formatted markdown) and **Source** (raw markdown/source view). Users can toggle between these modes using the render mode button in the chat UI. This document outlines common issues, root causes, and solutions for problems encountered with the live/source view toggle implementation.

---

## 1. Toggle Button Not Switching Modes

### Symptoms
- Clicking the render mode button does not change the message display.
- The button icon or tooltip does not update.

### Causes
- Event handler not attached or not firing.
- UI state not updating plugin settings.
- DOM not re-rendering after mode change.

### Solutions
- Ensure the button's click event is registered and calls the render mode toggle handler.
- Verify that `plugin.settings.uiBehavior.chatRenderMode` is updated on toggle.
- Call `reRenderAllMessages()` after changing the mode to update all message displays.
- Check for errors in the console that may prevent UI updates.

---

## 2. Messages Not Updating After Toggle

### Symptoms
- Messages remain in the previous mode after toggling (e.g., still formatted after switching to source).

### Causes
- `reRenderAllMessages()` not called or not implemented correctly.
- Message elements missing required data attributes (e.g., `data-raw-content`).
- Render mode logic not applied to all message elements.

### Solutions
- Ensure `reRenderAllMessages()` iterates over all `.ai-chat-message` elements and applies the correct render logic.
- When rendering messages, always set `data-raw-content` for both user and assistant messages.
- In `applyRenderModeToElement()`, check for the current mode and update the DOM accordingly.

---

## 3. Source Mode Formatting Issues

### Symptoms
- Raw markdown is not displayed as plain text (e.g., still rendered as HTML/markdown).
- Code blocks, links, or formatting are not visible as source.

### Causes
- Not using a `<pre>` element or not setting `textContent` in source mode.
- Failing to clear previous HTML content before inserting raw text.

### Solutions
- In source mode, use a `<pre>` element and set its `textContent` to the raw markdown.
- Clear the `.message-content` element before appending the `<pre>` block.
- Apply monospace font and appropriate background for readability.

---

## 4. Live Mode Not Rendering Markdown

### Symptoms
- Messages in live mode show raw markdown instead of formatted output.

### Causes
- Markdown renderer not called or not awaited.
- `rawContent` not passed to the renderer.

### Solutions
- Use `MarkdownRenderer.render()` with the correct content and container.
- Ensure the function is awaited to allow rendering to complete.
- After rendering, re-enable clickable links if needed.

---

## 5. Render Mode Not Persisting

### Symptoms
- Render mode resets after reload or navigation.

### Causes
- Mode not saved to plugin settings.
- UI not reading mode from settings on load.

### Solutions
- Update `plugin.settings.uiBehavior.chatRenderMode` on toggle and save settings.
- On UI initialization, read the mode from settings and apply it to the button and messages.

---

## 6. Performance Issues When Toggling

### Symptoms
- UI lags or freezes when switching modes with many messages.

### Causes
- Inefficient DOM updates (e.g., re-rendering all messages unnecessarily).
- Large chat histories causing slow iteration.

### Solutions
- Use DOM batching or requestAnimationFrame for bulk updates.
- Limit the number of messages rendered at once if possible.
- Profile with browser dev tools to identify bottlenecks.

---

## 7. Edge Cases & Miscellaneous

- **New messages after toggle:** Ensure new messages use the current render mode.
- **Message editing:** When editing, always revert to live mode for the textarea.
- **Plugin upgrades:** After updates, verify that render mode logic is still compatible with new settings or UI changes.

---

## References
- See `src/chat.ts` for render mode logic (`applyRenderModeToElement`, `reRenderAllMessages`).
- See `styles.css` for `.message-content`, `.ai-chat-message`, and `<pre>` styling.
- See `README.md` and implementation docs for architectural notes.

---

## Contact
For persistent issues, file a bug report with reproduction steps and screenshots.
