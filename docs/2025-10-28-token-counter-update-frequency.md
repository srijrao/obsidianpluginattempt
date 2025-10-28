# 2025-10-28-token-counter-update-frequency.md

## Feature: More Responsive Token Counter (Debounced Updates)

### Summary
Improved the token counter in the chat UI to update more frequently and responsively, while avoiding unnecessary performance overhead. Token count recalculation is now debounced and triggered on relevant user actions.

### Implementation Details
- Integrated `AsyncDebouncer` to batch token count updates and prevent excessive recalculation.
- Token counter now updates on:
  - Chat input changes (with debounce)
  - Reference note toggles (debounced)
  - Context note toggles (debounced)
  - Agent mode toggles (debounced)
  - Model selection changes
  - Other relevant UI events
- Updates are only performed when the chat UI is visible and necessary.
- No recalculation on every keystroke; updates occur after a short pause or when user stops typing.
- Ensures accurate token count display without impacting UI performance.

### Files Modified
- `src/chat.ts` (ChatView logic)
- `utils/contextBuilder.ts` (context assembly and token counting)
- Any related UI components displaying token count

### Why
- Provides users with more accurate, real-time feedback on token usage
- Prevents wasted computation and UI lag from excessive updates
- Aligns with best practices for performance and user experience

### Testing & Validation
- Verified token counter updates correctly on all relevant actions
- No noticeable performance impact during rapid input or context changes
- Manual and automated tests pass

### Notes
- Further tuning of debounce interval may be needed based on user feedback
- Can be extended to other UI elements if needed
