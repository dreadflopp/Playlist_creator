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
  const { message, chatHistory = [], currentPlaylist = null, model = 'gpt-4o-mini' } = req.body;

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
      systemPrompt += `When a user asks for a playlist, provide a friendly response and suggest songs that match their request. If the use don't specify how many songs they want, suggest 5 songs.`;
    }

    systemPrompt += `\n\nReturn the response as structured JSON with a reply message and an array of songs, where each song has a "song" and "artist" property.`;

    // Build messages array with chat history
    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // Add chat history (excluding the current message)
    if (Array.isArray(chatHistory) && chatHistory.length > 0) {
      messages.push(...chatHistory);
    }

    // Add current user message
    messages.push({ role: 'user', content: message });

    // Validate model name - removed GPT-4.1 models as they're optimized for reasoning/coding, not this use case
    const validModels = ['gpt-4o-mini', 'gpt-4o', 'gpt-5-mini', 'gpt-5'];
    const modelToUse = validModels.includes(model) ? model : 'gpt-4o-mini';

    // GPT-5 models have different API requirements:
    // - Use max_completion_tokens instead of max_tokens
    // - Don't support custom temperature (only default value of 1)
    // - Support reasoning_effort and verbosity parameters for creativity control
    const isGPT5Model = modelToUse.startsWith('gpt-5');
    const requestParams = {
      model: modelToUse,
      messages: messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'playlist_response',
          strict: true,
          schema: playlistResponseSchema
        }
      }
    };

    // Set parameters based on model version
    if (isGPT5Model) {
      // GPT-5 uses reasoning tokens for internal thinking, then output tokens for the response
      // Reasoning tokens consume from max_completion_tokens budget
      // Need higher reasoning effort to ensure the model actually thinks about real songs
      // Higher reasoning effort uses more tokens but produces better, more accurate results
      requestParams.max_completion_tokens = 20000; // Increased significantly to allow for high reasoning + output
      // GPT-5 creativity parameters:
      // - reasoning_effort: controls depth of reasoning (minimal, low, medium, high)
      //   'high' uses more reasoning tokens but ensures better accuracy and real song selection
      //   Needed to prevent the model from making up songs that don't exist
      // - verbosity: controls response detail (low, medium, high)
      //   'low' is sufficient for structured outputs
      requestParams.reasoning_effort = 'high'; // High reasoning to ensure real, accurate song suggestions
      requestParams.verbosity = 'low'; // Structured outputs don't need verbose responses
    } else {
      requestParams.max_tokens = 500;
      requestParams.temperature = 0.7; // GPT-4o models support custom temperature
    }

    // Debug: Log request details
    console.log('\n[OpenAI Debug] === API Request ===');
    console.log(`Model: ${requestParams.model}`);
    console.log(`Messages count: ${requestParams.messages.length}`);
    console.log(`System prompt: ${requestParams.messages[0]?.content?.substring(0, 100)}...`);
    console.log(`Request params:`, JSON.stringify({
      model: requestParams.model,
      hasResponseFormat: !!requestParams.response_format,
      maxTokens: requestParams.max_tokens || requestParams.max_completion_tokens,
      temperature: requestParams.temperature,
      reasoning_effort: requestParams.reasoning_effort,
      verbosity: requestParams.verbosity
    }, null, 2));

    const completion = await openai.chat.completions.create(requestParams);

    // Debug: Log response details
    console.log('\n[OpenAI Debug] === API Response ===');
    console.log(`Completion ID: ${completion.id}`);
    console.log(`Model used: ${completion.model}`);
    console.log(`Finish reason: ${completion.choices[0]?.finish_reason}`);
    console.log(`Usage - Prompt tokens: ${completion.usage?.prompt_tokens}, Completion tokens: ${completion.usage?.completion_tokens}, Total: ${completion.usage?.total_tokens}`);

    const content = completion.choices[0]?.message?.content;
    console.log(`Content length: ${content?.length || 0} characters`);
    console.log(`Content preview: ${content?.substring(0, 200) || '(empty)'}...`);

    // Parse the structured response (should be valid JSON from structured output)
    if (!content || content.trim() === '') {
      console.error('[OpenAI Debug] ERROR: Empty response content');
      console.error('[OpenAI Debug] Full completion object:', JSON.stringify(completion, null, 2));
      throw new Error('Empty response from OpenAI API');
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(content);
      console.log('[OpenAI Debug] ✅ JSON parsed successfully');
      console.log(`[OpenAI Debug] Parsed response keys: ${Object.keys(parsedResponse).join(', ')}`);
    } catch (parseError) {
      console.error('[OpenAI Debug] ❌ JSON Parse Error:', parseError.message);
      console.error('[OpenAI Debug] Full response content:', content);
      console.error('[OpenAI Debug] Content length:', content.length);
      throw new Error(`Failed to parse JSON response from model: ${parseError.message}`);
    }

    // Convert song objects to "Song - Artist" format for compatibility
    const songs = parsedResponse.songs.map(song => `${song.song} - ${song.artist}`);

    return res.json({
      reply: parsedResponse.reply,
      songs: songs
    });
  } catch (error) {
    console.error('OpenAI API Error:', error);

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
        error: 'Failed to process request with OpenAI API.',
        details: error.message
      });
    }
  }
});

module.exports = router;

