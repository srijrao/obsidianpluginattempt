# Semantic Search Example

This note demonstrates how to use the new semantic search codeblock feature. You can now embed semantic search results directly in your notes as live content that updates in reading view.

## Basic Usage

To perform a semantic search, create a codeblock with the language set to `semantic-search` and put your query inside:

```semantic-search
machine learning concepts
```

The above codeblock will search your vector store for content semantically similar to "machine learning concepts" and display the results directly in the note.

## How It Works

1. **Live Updates**: The search results appear in reading/live preview mode
2. **Clickable Links**: File paths are clickable and will open the source note
3. **Similarity Scores**: Each result shows a percentage similarity score
4. **Highlighted Terms**: Query terms are highlighted in the results
5. **Styled Results**: Results are beautifully formatted with proper spacing and colors

## More Examples

Here are some other queries you can try:

```semantic-search
project management techniques
```

```semantic-search
cooking recipes and food preparation
```

```semantic-search
programming best practices
```

## Notes

- Make sure you have embedded some notes first using the "Embed All Notes" or "Embed Currently Open Note" commands
- The search uses your configured similarity threshold from the plugin settings
- Results are limited to the top 5 most similar matches
- An empty codeblock will show a helpful message asking you to enter a query

This feature combines the power of semantic search with the convenience of having results embedded directly in your notes!
