/**
 * Extract keywords from user message using AI
 * Returns keywords with synonyms if needed
 */
async function extractKeywordsWithAI(message, openaiInstance) {
    if (!openaiInstance) {
        console.error("[Keyword Extractor] OpenAI instance not provided");
        return [];
    }

    try {
        const response = await openaiInstance.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a keyword extraction assistant. Analyze the user's message and extract relevant keywords for finding Spotify playlists.

Extract keywords related to:
- Genres (rock, pop, jazz, hip hop, country, electronic, etc.)
- Moods (chill, happy, energetic, sad, romantic, etc.)
- Activities (workout, party, study, sleep, driving, etc.)
- Decades (80s, 90s, 2000s, etc.)
- Any other relevant music-related terms

For each keyword, also provide 2-3 synonyms or variations that might help find relevant playlists.

Return a JSON array of objects, each with:
- keyword: the main keyword
- synonyms: array of synonyms/variations (2-3 items)

If the message doesn't contain any relevant keywords for playlist matching, return an empty array.

Examples:
- "create a workout playlist" → [{"keyword": "workout", "synonyms": ["exercise", "fitness", "gym"]}]
- "I want chill jazz music" → [{"keyword": "chill", "synonyms": ["relax", "calm", "mellow"]}, {"keyword": "jazz", "synonyms": ["jazz music", "smooth jazz"]}]
- "rock songs from the 80s" → [{"keyword": "rock", "synonyms": ["rock music", "rock and roll"]}, {"keyword": "80s", "synonyms": ["eighties", "1980s"]}]
- "create a metallica playlist" → [] (no genre/mood/activity keywords)`,
                },
                {
                    role: "user",
                    content: message,
                },
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "keyword_extraction",
                    schema: {
                        type: "object",
                        properties: {
                            keywords: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        keyword: {
                                            type: "string",
                                            description: "The main keyword extracted",
                                        },
                                        synonyms: {
                                            type: "array",
                                            items: {
                                                type: "string",
                                            },
                                            minItems: 0,
                                            maxItems: 5,
                                            description: "Synonyms or variations of the keyword",
                                        },
                                    },
                                    required: ["keyword", "synonyms"],
                                    additionalProperties: false,
                                },
                                description: "Array of keywords with synonyms",
                            },
                        },
                        required: ["keywords"],
                        additionalProperties: false,
                    },
                },
            },
            temperature: 0.3,
            max_tokens: 300,
        });

        const content = response.choices[0].message.content;
        const parsed = typeof content === "string" ? JSON.parse(content) : content;

        const keywords = parsed.keywords || [];
        console.log(`[Keyword Extractor] Extracted ${keywords.length} keywords with synonyms`);

        return keywords;
    } catch (error) {
        console.error("[Keyword Extractor] Error extracting keywords:", error);
        return [];
    }
}

/**
 * Flatten keywords and synonyms into a single array for searching
 */
function flattenKeywords(keywordData) {
    const allKeywords = new Set();

    keywordData.forEach(({ keyword, synonyms = [] }) => {
        allKeywords.add(keyword.toLowerCase());
        synonyms.forEach((syn) => allKeywords.add(syn.toLowerCase()));
    });

    return Array.from(allKeywords);
}

module.exports = {
    extractKeywordsWithAI,
    flattenKeywords,
};

