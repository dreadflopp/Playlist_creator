/**
 * Abstract base class for intent handlers
 * All intent handlers must extend this class
 */
class BaseIntentHandler {
    constructor() {
        this.name = this.constructor.name;
    }

    /**
     * Handle the intent and return context and metadata
     * @param {Object} intent - Intent object with intentType and confidence
     * @param {string} message - User message
     * @param {Object} currentPlaylist - Current playlist object
     * @param {string} model - OpenAI model name
     * @param {string} previousResponseId - Previous response ID for stateful conversations
     * @param {string} session_id - Session ID
     * @param {Object} dataSources - Data source registry
     * @param {Object} contextBuilders - Context builder registry
     * @returns {Promise<Object>} Object with context string and metadata
     */
    async handle(intent, message, currentPlaylist, model, previousResponseId, session_id, dataSources, contextBuilders) {
        throw new Error("handle() must be implemented by subclass");
    }

    /**
     * Check if this handler requires a two-phase approach
     * @returns {boolean}
     */
    requiresTwoPhase() {
        return false;
    }
}

module.exports = BaseIntentHandler;
