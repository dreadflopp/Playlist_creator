// Centralized pricing configuration for all OpenAI models
const MODEL_PRICING = {
    "gpt-4o": {
        input: 2.5 / 1000000,
        cached: 0.25 / 1000000,
        output: 10.0 / 1000000,
    },
    "gpt-4o-mini": {
        input: 0.15 / 1000000,
        cached: 0.015 / 1000000,
        output: 0.6 / 1000000,
    },
    "gpt-5": {
        input: 1.25 / 1000000,
        cached: 0.125 / 1000000,
        output: 10.0 / 1000000,
    },
    "gpt-5-mini": {
        input: 0.25 / 1000000,
        cached: 0.025 / 1000000,
        output: 2.0 / 1000000,
    },
};

/**
 * Get pricing for a specific model
 * @param {string} model - Model name (gpt-4o, gpt-5, gpt-5-mini)
 * @returns {Object} Pricing object with input, cached, and output rates
 */
function getPricing(model) {
    return MODEL_PRICING[model] || MODEL_PRICING["gpt-4o"];
}

/**
 * Calculate cost from usage data
 * @param {Object} usage - Usage object with token counts
 * @param {string} model - Model name
 * @returns {number} Cost in USD
 */
function calculateCost(usage, model) {
    const pricing = getPricing(model);
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const cachedTokens = usage.cached_tokens || 0;
    const uncachedInputTokens = promptTokens - cachedTokens;
    
    return uncachedInputTokens * pricing.input + 
           cachedTokens * pricing.cached + 
           completionTokens * pricing.output;
}

/**
 * Calculate cost from multiple usage objects (e.g., Phase 1 + Phase 2)
 * @param {Array<Object>} usages - Array of usage objects
 * @param {string} model - Model name
 * @returns {number} Total cost in USD
 */
function calculateTotalCost(usages, model) {
    const pricing = getPricing(model);
    
    let totalUncachedInput = 0;
    let totalCached = 0;
    let totalOutput = 0;
    
    usages.forEach(usage => {
        const promptTokens = usage.prompt_tokens || 0;
        const completionTokens = usage.completion_tokens || 0;
        const cachedTokens = usage.cached_tokens || 0;
        totalUncachedInput += promptTokens - cachedTokens;
        totalCached += cachedTokens;
        totalOutput += completionTokens;
    });
    
    return totalUncachedInput * pricing.input + 
           totalCached * pricing.cached + 
           totalOutput * pricing.output;
}

module.exports = { 
    getPricing, 
    calculateCost, 
    calculateTotalCost,
    MODEL_PRICING 
};

