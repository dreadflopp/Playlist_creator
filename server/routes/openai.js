const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');

// Initialize OpenAI client - API key is required
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log('OpenAI API initialized with API key');
} else {
  console.error('ERROR: OPENAI_API_KEY not found in environment variables');
}

// In-memory store for conversation state (response IDs)
// In production, you might want to use Redis or a database
// Key: sessionId or userId, Value: last response_id
const conversationState = new Map();

// JSON Schema for structured output
const playlistResponseSchema = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "A friendly message explaining the playlist theme or mood"
    },
    songs: {
      type: "array",
      description: "Array of songs for the playlist",
      items: {
        type: "object",
        properties: {
          song: {
            type: "string",
            description: "The name of the song"
          },
          artist: {
            type: "string",
            description: "The name of the artist who performs the song"
          }
        },
        required: ["song", "artist"],
        additionalProperties: false
      },
      minItems: 1,
      maxItems: 20  // Allow more songs for editing scenarios
    }
  },
  required: ["reply", "songs"],
  additionalProperties: false
};

router.post('/chat', async (req, res) => {
  const { message, currentPlaylist = null, model = 'gpt-5-mini', previous_response_id = null, session_id = null } = req.body;

  // Validate input
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Check if OpenAI is configured
  if (!openai) {
    return res.status(500).json({
      error: 'OpenAI API is not configured. Please set OPENAI_API_KEY in your environment variables.'
    });
  }

  try {
    // Get previous response ID from either the request or stored state
    let previousResponseId = previous_response_id;
    if (!previousResponseId && session_id) {
      previousResponseId = conversationState.get(session_id);
    }

    // Build system prompt with context
    let systemPrompt = `You are a helpful AI assistant that creates and edits music playlists. `;

    if (currentPlaylist && currentPlaylist.songs && currentPlaylist.songs.length > 0) {
      const songList = currentPlaylist.songs.map((s, i) => `${i + 1}. ${s}`).join('\n');
      systemPrompt += `\n\nCURRENT PLAYLIST:\n${songList}\n\n`;
      systemPrompt += `The user may ask you to:\n`;
      systemPrompt += `- Add new songs to the existing playlist\n`;
      systemPrompt += `- Remove specific songs from the playlist\n`;
      systemPrompt += `- Replace the entire playlist with new songs\n`;
      systemPrompt += `- Modify the playlist based on their request\n\n`;
      systemPrompt += `When editing, return the COMPLETE updated playlist (including any songs you're keeping from the current playlist plus any new ones you're adding).`;
    } else {
      systemPrompt += `When a user asks for a playlist, provide a friendly response and suggest songs that match their request. If the user don't specify how many songs they want, suggest 5 songs.`;
    }

    systemPrompt += `\n\nReturn the response as structured JSON with a reply message and an array of songs, where each song has a "song" and "artist" property.`;

    // Responses API uses 'input' (string) instead of 'messages' (array)
    // We combine system prompt and user message into a single input string
    // The Responses API manages conversation history automatically via previous_response_id
    // 
    // NOTE: We always include the playlist context because the user can manually edit
    // the playlist (add/remove songs), and this state is not part of the conversation
    // history managed by the Responses API. Each request needs the current playlist state.
    const inputText = `${systemPrompt}\n\nUser: ${message}`;

    // Validate model name - only GPT-5 models are supported
    const validModels = ['gpt-5-mini', 'gpt-5'];
    const modelToUse = validModels.includes(model) ? model : 'gpt-5-mini';

    // Responses API parameters:
    // - Uses 'input' (string) instead of 'messages' (array)
    // - Uses stateful conversations (automatically manages history via previous_response_id)
    // - store: true enables stateful mode, API manages conversation history
    // - Don't support custom temperature (only default value of 1)
    // - Support reasoning_effort and verbosity parameters for creativity control
    // - No max_completion_tokens limit (let OpenAI use defaults)
    // - response_format has moved to text.format in Responses API
    const requestParams = {
      model: modelToUse,
      input: inputText, // Responses API uses 'input' instead of 'messages'
      store: true, // Enable stateful conversations - API manages history
      text: {
        format: {
          type: 'json_schema',
          name: 'playlist_response', // Required: name at format level
          schema: playlistResponseSchema // Required: schema at format level
        },
        verbosity: 'low' // Controls response detail (low, medium, high) - 'low' is sufficient for structured outputs
      },
      // GPT-5 creativity parameters (Responses API structure):
      // - reasoning.effort: controls depth of reasoning (minimal, low, medium, high)
      //   'high' uses more reasoning tokens but ensures better accuracy and real song selection
      //   Needed to prevent the model from making up songs that don't exist
      reasoning: {
        effort: 'high' // High reasoning to ensure real, accurate song suggestions
      }
    };

    // If this is a continuation of a conversation, reference the previous response
    if (previousResponseId) {
      requestParams.previous_response_id = previousResponseId;
    }

    // Debug: Log request details
    console.log('\n[OpenAI Debug] === Responses API Request ===');
    console.log(`Model: ${requestParams.model}`);
    console.log(`Input length: ${requestParams.input.length} characters`);
    console.log(`Store (stateful): ${requestParams.store}`);
    console.log(`Previous response ID: ${requestParams.previous_response_id || 'None (first message)'}`);
    console.log(`Input preview: ${requestParams.input.substring(0, 200)}...`);
    console.log(`Request params:`, JSON.stringify({
      model: requestParams.model,
      store: requestParams.store,
      previous_response_id: requestParams.previous_response_id,
      hasTextFormat: !!requestParams.text?.format,
      hasTextVerbosity: !!requestParams.text?.verbosity,
      reasoning_effort: requestParams.reasoning?.effort
    }, null, 2));

    // Use Responses API instead of Chat Completions API
    // Note: Responses API is available directly on the client (not under beta)
    const completion = await openai.responses.create(requestParams);

    // Debug: Log response details
    console.log('\n[OpenAI Debug] === Responses API Response ===');
    console.log(`Response ID: ${completion.id}`);
    console.log(`Model used: ${completion.model}`);
    console.log(`Full usage object:`, JSON.stringify(completion.usage || {}, null, 2));
    console.log(`Usage keys:`, Object.keys(completion.usage || {}));
    console.log(`Usage - Prompt tokens: ${completion.usage?.prompt_tokens || 'N/A'}, Completion tokens: ${completion.usage?.completion_tokens || 'N/A'}, Total: ${completion.usage?.total_tokens || 'N/A'}`);
    console.log(`Usage - Input tokens: ${completion.usage?.input_tokens || 'N/A'}, Output tokens: ${completion.usage?.output_tokens || 'N/A'}`);

    // Responses API structure: output_text contains the response
    // According to the API, responses are returned in completion.output_text
    const content = completion.output_text ||
      completion.text?.output_text ||
      completion.choices?.[0]?.message?.content ||
      completion.content ||
      completion.message?.content;
    console.log(`Content type: ${typeof content}`);
    console.log(`Content length: ${typeof content === 'string' ? content.length : JSON.stringify(content).length} characters`);
    console.log(`Content preview: ${typeof content === 'string' ? content.substring(0, 200) : JSON.stringify(content).substring(0, 200)}...`);

    // Parse the structured response (should be valid JSON from structured output)
    if (!content || (typeof content === 'string' && content.trim() === '')) {
      console.error('[OpenAI Debug] ERROR: Empty response content');
      console.error('[OpenAI Debug] Full response object:', JSON.stringify(completion, null, 2));
      throw new Error('Empty response from OpenAI Responses API');
    }

    let parsedResponse;
    try {
      // Content might already be parsed if Responses API returns structured output differently
      if (typeof content === 'string') {
        parsedResponse = JSON.parse(content);
      } else if (typeof content === 'object') {
        parsedResponse = content;
      } else {
        throw new Error(`Unexpected content type: ${typeof content}`);
      }
      console.log('[OpenAI Debug] ✅ JSON parsed successfully');
      console.log(`[OpenAI Debug] Parsed response keys: ${Object.keys(parsedResponse).join(', ')}`);
    } catch (parseError) {
      console.error('[OpenAI Debug] ❌ JSON Parse Error:', parseError.message);
      console.error('[OpenAI Debug] Full response content:', content);
      console.error('[OpenAI Debug] Content type:', typeof content);
      throw new Error(`Failed to parse JSON response from Responses API: ${parseError.message}`);
    }

    // Convert song objects to "Song - Artist" format for compatibility
    const songs = parsedResponse.songs.map(song => `${song.song} - ${song.artist}`);

    // Store the response_id for stateful conversations
    // Use session_id if provided, otherwise use a default
    const sessionId = session_id || 'default';
    if (completion.id) {
      conversationState.set(sessionId, completion.id);
      console.log(`[OpenAI Debug] Stored response_id ${completion.id} for session ${sessionId}`);
    }

    // Calculate cost based on model pricing
    // Prices from OpenAI pricing page: https://openai.com/api/pricing/
    // GPT-5 (per 1M tokens): Input: $1.25, Cached: $0.125, Output: $10.00
    // GPT-5-mini (per 1M tokens): Input: $0.25, Cached: $0.025, Output: $2.00
    const pricing = {
      'gpt-5': {
        input: 1.25 / 1000000,
        cached: 0.125 / 1000000,
        output: 10.00 / 1000000
      },
      'gpt-5-mini': {
        input: 0.25 / 1000000,
        cached: 0.025 / 1000000,
        output: 2.00 / 1000000
      }
    };

    // Responses API uses: input_tokens, output_tokens (not prompt_tokens/completion_tokens)
    // Structure: usage.input_tokens, usage.output_tokens, usage.total_tokens
    // Details: usage.input_tokens_details.cached_tokens, usage.output_tokens_details.reasoning_tokens
    const usage = completion.usage || {};

    // Extract token counts (Responses API structure)
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const totalTokens = usage.total_tokens || 0;

    // Extract detailed token counts
    const cachedTokens = usage.input_tokens_details?.cached_tokens || 0;
    const reasoningTokens = usage.output_tokens_details?.reasoning_tokens || 0;

    // Calculate uncached input tokens (input - cached)
    const uncachedInputTokens = inputTokens - cachedTokens;

    // Debug: Log extracted values
    console.log(`[OpenAI Debug] Extracted usage - Input: ${inputTokens} (cached: ${cachedTokens}, uncached: ${uncachedInputTokens}), Output: ${outputTokens} (reasoning: ${reasoningTokens}), Total: ${totalTokens}`);

    const modelPricing = pricing[modelToUse] || pricing['gpt-5-mini'];

    // Calculate cost: uncached input + cached input + output
    // Reasoning tokens are part of output_tokens and billed at output rate
    const cost = (uncachedInputTokens * modelPricing.input) +
      (cachedTokens * modelPricing.cached) +
      (outputTokens * modelPricing.output);

    // For display purposes, map to prompt/completion terminology
    // Input tokens = prompt tokens, Output tokens = completion tokens
    const finalPromptTokens = inputTokens;
    const finalCompletionTokens = outputTokens;

    return res.json({
      reply: parsedResponse.reply,
      songs: songs,
      response_id: completion.id, // Return response_id for frontend to use in next request
      usage: {
        prompt_tokens: finalPromptTokens,
        completion_tokens: finalCompletionTokens,
        total_tokens: totalTokens,
        cost_usd: cost
      },
      model: modelToUse
    });
  } catch (error) {
    console.error('OpenAI Responses API Error:', error);

    // Return appropriate error based on error type
    if (error.status === 401) {
      return res.status(401).json({
        error: 'Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable.'
      });
    } else if (error.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Please try again later.'
      });
    } else if (error.status >= 500) {
      return res.status(503).json({
        error: 'OpenAI service is temporarily unavailable. Please try again later.'
      });
    } else {
      return res.status(500).json({
        error: 'Failed to process request with OpenAI Responses API.',
        details: error.message
      });
    }
  }
});

module.exports = router;

