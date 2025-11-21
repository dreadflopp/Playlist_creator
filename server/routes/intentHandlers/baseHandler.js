/**
 * Abstract base class for intent handlers
 * All intent handlers must extend this class
 */
class BaseIntentHandler {
    constructor() {
        this.name = this.constructor.name;
    }

    /**
     * Get the phase this handler belongs to (1 or 2)
     * Phase 1: No parameters needed, can fetch data directly
     * Phase 2: Needs data from Phase 1 result (e.g., artists from playlist)
     * @returns {number} Phase number (1 or 2)
     */
    getPhase() {
        throw new Error("getPhase() must be implemented by subclass");
    }

    /**
     * Handle the intent and return context
     * @param {Object} intent - Intent object with intentType and confidence
     * @param {string} message - User message
     * @param {Object} currentPlaylist - Current playlist object
     * @param {Object} dataSources - Data source registry
     * @param {Object} contextBuilders - Context builder registry
     * @param {Object} phase1Data - Phase 1 result data (null for Phase 1 handlers, contains playlist for Phase 2)
     * @param {string} sessionId - User session ID for market-based searches (optional)
     * @returns {Promise<Object>} Object with context string: { context: "..." }
     */
    async handle(intent, message, currentPlaylist, dataSources, contextBuilders, phase1Data = null, sessionId = null) {
        throw new Error("handle() must be implemented by subclass");
    }
}

module.exports = BaseIntentHandler;
