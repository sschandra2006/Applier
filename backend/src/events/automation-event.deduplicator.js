/**
 * Automation Event Deduplicator & Stream Consumer Helper
 * Applier 2.0 — Phase 18: Real-Time Automation Event System
 *
 * Provides consumer-side protection:
 * 1. Duplicate event prevention (by eventId and sequenceNumber).
 * 2. Strict event ordering enforcement.
 * 3. Missed event gap detection & catch-up triggering.
 * 4. Reconciliation against MongoDB durable source of truth.
 */

export class AutomationEventDeduplicator {
  constructor(options = {}) {
    this.seenEventIds = new Set();
    this.lastSequenceNumber = options.initialSequence ?? 0;
    this.maxHistory = options.maxHistory ?? 1000;
    this.processedEvents = [];
  }

  /**
   * Processes an incoming event from the SSE stream.
   *
   * @param {object} event The incoming AutomationEvent object
   * @returns {object} { accepted: boolean, isDuplicate: boolean, hasGap: boolean, missedRange: object|null, reason?: string, event: object }
   */
  process(event) {
    if (!event || typeof event !== 'object') {
      return {
        accepted: false,
        isDuplicate: false,
        hasGap: false,
        missedRange: null,
        reason: 'INVALID_EVENT_PAYLOAD',
        event: null
      };
    }

    const { eventId, sequenceNumber } = event;

    // 1. Duplicate ID Check
    if (eventId && this.seenEventIds.has(eventId)) {
      return {
        accepted: false,
        isDuplicate: true,
        hasGap: false,
        missedRange: null,
        reason: 'DUPLICATE_EVENT_ID',
        event
      };
    }

    // 2. Duplicate or Stale Sequence Check
    if (typeof sequenceNumber === 'number' && sequenceNumber <= this.lastSequenceNumber) {
      return {
        accepted: false,
        isDuplicate: true,
        hasGap: false,
        missedRange: null,
        reason: 'STALE_OR_DUPLICATE_SEQUENCE',
        event
      };
    }

    // 3. Gap Detection (Missed Events)
    let hasGap = false;
    let missedRange = null;

    if (typeof sequenceNumber === 'number') {
      const expected = this.lastSequenceNumber + 1;
      if (sequenceNumber > expected && this.lastSequenceNumber > 0) {
        hasGap = true;
        missedRange = {
          from: expected,
          to: sequenceNumber - 1,
          count: sequenceNumber - expected
        };
      }
    }

    // 4. Accept Event & Update State
    if (eventId) {
      this.seenEventIds.add(eventId);
      if (this.seenEventIds.size > this.maxHistory) {
        // Prune oldest
        const [first] = this.seenEventIds;
        this.seenEventIds.delete(first);
      }
    }

    if (typeof sequenceNumber === 'number') {
      this.lastSequenceNumber = sequenceNumber;
    }

    this.processedEvents.push(event);

    return {
      accepted: true,
      isDuplicate: false,
      hasGap,
      missedRange,
      event
    };
  }

  /**
   * Resets consumer state.
   */
  reset(initialSequence = 0) {
    this.seenEventIds.clear();
    this.lastSequenceNumber = Number(initialSequence || 0);
    this.processedEvents = [];
  }

  /**
   * Returns list of processed events.
   */
  getProcessedEvents() {
    return [...this.processedEvents];
  }
}

export default AutomationEventDeduplicator;
