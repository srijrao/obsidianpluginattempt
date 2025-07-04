# GetUserFeedback Tool - Usage Examples

The `GetUserFeedback` tool allows the agent to ask questions and receive responses from the user during task execution. It supports both text input and multiple choice questions with interactive UI elements.

## Tool Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `question` | string | Yes | - | The question to ask the user |
| `type` | string | No | "text" | Response type: "text" or "choice" |
| `choices` | string[] | No | [] | Array of choices (required if type is "choice") |
| `timeout` | number | No | 300000 | Timeout in milliseconds (5 minutes default) |
| `allowCustomAnswer` | boolean | No | false | For choice type, allow custom text input |
| `placeholder` | string | No | - | Placeholder text for input fields |

## Example Usage

### 1. Simple Text Question

```json
{
  "action": "get_user_feedback",
  "parameters": {
    "question": "What would you like me to name this new file?",
    "type": "text",
    "placeholder": "Enter filename..."
  }
}
```

### 2. Multiple Choice Question

```json
{
  "action": "get_user_feedback",
  "parameters": {
    "question": "Which format would you like for the output?",
    "type": "choice",
    "choices": ["JSON", "YAML", "XML", "CSV"]
  }
}
```

### 3. Multiple Choice with Custom Answer Option

```json
{
  "action": "get_user_feedback",
  "parameters": {
    "question": "How should I organize these files?",
    "type": "choice",
    "choices": ["By date", "By category", "By size"],
    "allowCustomAnswer": true,
    "placeholder": "Describe your preferred organization method..."
  }
}
```

### 4. Question with Custom Timeout

```json
{
  "action": "get_user_feedback",
  "parameters": {
    "question": "Do you want to proceed with deleting these files?",
    "type": "choice",
    "choices": ["Yes, delete them", "No, keep them"],
    "timeout": 30000
  }
}
```

## Tool Response Format

### Successful Response

```json
{
  "success": true,
  "data": {
    "requestId": "feedback_1234567890_abc123",
    "status": "completed",
    "question": "What would you like me to name this file?",
    "type": "text",
    "answer": "meeting-notes.md",
    "timestamp": "2025-07-03T10:30:00.000Z",
    "responseTimeMs": 5420
  }
}
```

### Choice Response

```json
{
  "success": true,
  "data": {
    "requestId": "feedback_1234567890_def456",
    "status": "completed",
    "question": "Which format would you like?",
    "type": "choice",
    "answer": "JSON",
    "choiceIndex": 0,
    "timestamp": "2025-07-03T10:31:00.000Z",
    "responseTimeMs": 2100
  }
}
```

### Timeout/Error Response

```json
{
  "success": false,
  "error": "User feedback timeout after 300000ms",
  "data": {
    "requestId": "feedback_1234567890_ghi789",
    "status": "timeout",
    "question": "Do you want to proceed?",
    "type": "choice",
    "choices": ["Yes", "No"],
    "timeout": 300000
  }
}
```

## UI Behavior

### Text Input
- Displays a textarea for free-form text input
- Enter key submits (Shift+Enter for new line)
- Submit button available
- Shows character count if applicable

### Multiple Choice
- Displays clickable buttons for each choice
- One-click selection and immediate submission
- Visual feedback on selection
- Optional custom text input if `allowCustomAnswer` is true

### Interactive Features
- Real-time timeout countdown
- Visual feedback on response submission
- Error handling for timeouts and failures
- Responsive design that adapts to different screen sizes

## Integration Tips

1. **Use for Decision Points**: Ask users to choose between different approaches or options
2. **Gather Missing Information**: Request file names, paths, or configuration values
3. **Confirm Destructive Actions**: Get explicit confirmation before deleting or modifying files
4. **Customize Workflows**: Let users specify preferences for how tasks should be completed
5. **Progressive Disclosure**: Break complex tasks into steps with user guidance at each stage

## Agent Response Handler Integration

The `GetUserFeedback` tool is fully integrated with the agent response handling system:

### Automatic Task Status Management
- When a `get_user_feedback` tool is executed, the task status automatically changes to `"waiting_for_user"`
- The agent execution pauses until the user provides their response
- Once the user responds, the task status returns to `"running"` and execution continues

### Asynchronous Execution Flow
1. Agent calls `get_user_feedback` tool
2. Tool returns immediate "pending" result with interactive UI data
3. `AgentResponseHandler` detects the pending status and sets up async waiting
4. User sees interactive UI (buttons for choices, text input for text questions)
5. When user responds, the promise resolves and execution continues
6. Agent receives the user's response as a completed tool result

### UI State Management
- Interactive elements are automatically rendered in the chat
- Tool displays update in real-time when user responds
- Task progress indicators show "waiting for user" status
- Timeout handling with visual countdown (if configured)

## Best Practices

- Keep questions clear and specific
- Provide meaningful choices that cover the most common options
- Use appropriate timeouts (shorter for simple yes/no, longer for complex input)
- Include custom answer options for flexibility when needed
- Use placeholder text to guide user input
- Consider the context and avoid overwhelming users with too many choices
