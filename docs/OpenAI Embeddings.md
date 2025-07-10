# Embeddings

Get a vector representation of a given input that can be easily consumed by machine learning models and algorithms.  
Related guide: [Embeddings](https://platform.openai.com/docs/guides/embeddings)

---

## Create Embeddings

**POST**  
`https://api.openai.com/v1/embeddings`  
Creates an embedding vector representing the input text.

---

### Request Body

- **input** (string or array)  
  *Required*  
  Input text to embed, encoded as a string or array of tokens.  
  - To embed multiple inputs in a single request, pass an array of strings or array of token arrays.
  - The input must not exceed the max input tokens for the model (8192 tokens for all embedding models).
  - Cannot be an empty string.
  - Any array must be 2048 dimensions or less.
  - Example Python code for counting tokens.
  - All embedding models enforce a maximum of 300,000 tokens summed across all inputs in a single request.

- **model** (string)  
  *Required*  
  ID of the model to use.  
  - You can use the List models API to see all of your available models, or see our Model overview for descriptions of them.

- **dimensions** (integer)  
  *Optional*  
  The number of dimensions the resulting output embeddings should have. Only supported in text-embedding-3 and later models.

- **encoding_format** (string)  
  *Optional*  
  Defaults to `float`.  
  The format to return the embeddings in. Can be either `float` or `base64`.

- **user** (string)  
  *Optional*  
  A unique identifier representing your end-user, which can help OpenAI to monitor and detect abuse. [Learn more](https://platform.openai.com/docs/guides/safety-best-practices/end-user-ids).

---

### Returns

A list of embedding objects.

---

## Example Request

```bash
curl https://api.openai.com/v1/embeddings \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "The food was delicious and the waiter...",
    "model": "text-embedding-3-small",
    "encoding_format": "float"
  }'
```

---

## Example Response

```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [
        0.0023064255,
        -0.009327292,
        // ... (1536 floats total for ada-002)
        -0.0028842222
      ],
      "index": 0
    }
  ],
  "model": "text-embedding-3-small",
  "usage": {
    "prompt_tokens": 8,
    "total_tokens": 8
  }
}
```

---

## The Embedding Object

Represents an embedding vector returned by embedding endpoint.

- **embedding** (array)  
  The embedding vector, which is a list of floats. The length of vector depends on the model as listed in the embedding guide.

- **index** (integer)  
  The index of the embedding in the list of embeddings.

- **object** (string)  
  The object type, which is always `"embedding"`.

### Example Embedding Object

```json
{
  "object": "embedding",
  "embedding": [
    0.0023064255,
    -0.009327292,
    // ... (1536 floats total for ada-002)
    -0.0028842222
  ],
  "index": 0
}
```