/**
 * Automation Event Service
 * Applier 2.0 — Phase 18: Real-Time Automation Event System
 *
 * Implements lightweight, robust Server-Sent Events (SSE) notification streaming
 * to replace client polling with event-driven execution updates.
 *
 * Core Guarantees:
 * 1. Events are notifications; MongoDB remains the durable source of truth.
 * 2. Monotonic sequence numbers guarantee deterministic event ordering per job.
 * 3. In-memory ring-buffer supports instant reconnection and missed-event replay (Last-Event-ID).
 * 4. Automatic keep-alive heartbeats prevent socket timeouts across reverse proxies.
 * 5. Full conformance with shared/schemas/automation-event.json (v2.0.0).
 */

import EventEmitter from 'events';
import crypto from 'crypto';
import mongoose from 'mongoose';
import {
  AutomationEventType,
  validateAutomationEvent
} from '../../../shared/src/index.js';

export class AutomationEventService {
  constructor(options = {}) {
    this.maxBufferSize = options.maxBufferSize ?? 200;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15000;
    this.automationModel = options.automationModel || null;

    // In-memory state tracking per jobId
    this.jobSequences = new Map(); // jobId -> number
    this.jobBuffers = new Map();   // jobId -> Array<AutomationEvent>
    this.subscribers = new Map();  // jobId -> Set<SubscriberClient>
    this.emitter = new EventEmitter();
  }

  /**
   * Lazily loads AutomationJob model if database is active
   */
  async _getAutomationModel() {
    if (this.automationModel) return this.automationModel;
    try {
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        const { AutomationJob } = await import('../automation/automation.model.js');
        this.automationModel = AutomationJob;
        return this.automationModel;
      }
    } catch (_) {}
    return null;
  }

  /**
   * Emits a canonical automation execution event.
   *
   * @param {object} params
   * @param {string} params.jobId Target automation job ID
   * @param {string} params.eventType One of AutomationEventType values
   * @param {object} params.payload Event-specific payload
   * @param {string} [params.applicationId] Associated application ID
   * @param {string} [params.timestamp] ISO-8601 timestamp
   * @returns {object} Canonical AutomationEvent object
   */
  emitEvent({
    jobId,
    eventType,
    payload = {},
    applicationId = null,
    timestamp = null
  }) {
    if (!jobId) {
      throw new Error('AutomationEventService: jobId is required to emit an event.');
    }

    if (!Object.values(AutomationEventType).includes(eventType)) {
      throw new Error(`AutomationEventService: Unsupported eventType "${eventType}".`);
    }

    const normalizedJobId = String(jobId);

    // 1. Monotonic Sequence Number Allocation
    const currentSeq = (this.jobSequences.get(normalizedJobId) || 0) + 1;
    this.jobSequences.set(normalizedJobId, currentSeq);

    // 2. Canonical Envelope Construction
    const event = {
      schemaVersion: '2.0.0',
      eventId: `evt_${normalizedJobId}_${currentSeq}_${crypto.randomUUID().slice(0, 8)}`,
      sequenceNumber: currentSeq,
      eventType,
      jobId: normalizedJobId,
      applicationId: applicationId ? String(applicationId) : null,
      timestamp: timestamp || new Date().toISOString(),
      payload: payload && typeof payload === 'object' ? payload : { value: payload }
    };

    // 3. Schema Validation
    const validation = validateAutomationEvent(event);
    if (!validation.valid) {
      console.warn('[AutomationEventService] Schema validation warning:', validation.errors);
    }

    // 4. Ring Buffer Persistence for Reconnection Replay
    if (!this.jobBuffers.has(normalizedJobId)) {
      this.jobBuffers.set(normalizedJobId, []);
    }
    const buffer = this.jobBuffers.get(normalizedJobId);
    buffer.push(event);
    if (buffer.length > this.maxBufferSize) {
      buffer.shift();
    }

    // 5. Broadcast to Connected SSE Clients
    this._broadcastToSubscribers(normalizedJobId, event);

    // 6. Node Internal EventEmitter Notification
    this.emitter.emit(`event:${normalizedJobId}`, event);
    this.emitter.emit('event', event);

    return event;
  }

  /**
   * Broadcasts an event to all active SSE subscribers for a jobId.
   */
  _broadcastToSubscribers(jobId, event) {
    const clients = this.subscribers.get(jobId);
    if (!clients || clients.size === 0) return;

    const sseMessage = this._formatSseMessage(event);

    for (const client of clients) {
      try {
        if (!client.res.writableEnded) {
          client.res.write(sseMessage);
        }
      } catch (writeErr) {
        // Stale or disconnected socket
        clients.delete(client);
      }
    }
  }

  /**
   * Formats a canonical event into SSE wire protocol.
   */
  _formatSseMessage(event) {
    return `id: ${event.eventId}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`;
  }

  /**
   * Subscribes an HTTP Express response stream to a jobId's SSE event notifications.
   *
   * @param {string} jobId Target job to subscribe to
   * @param {object} req Express request
   * @param {object} res Express response
   * @param {object} [options]
   * @param {boolean} [options.replayHistory=true] Whether to replay buffered past events
   * @param {string|number} [options.lastEventId] Client Last-Event-ID header / query
   */
  subscribe(jobId, req, res, options = {}) {
    const normalizedJobId = String(jobId);
    const replayHistory = options.replayHistory ?? true;

    // 1. Establish SSE HTTP Headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    // Initial SSE comment to acknowledge connection established
    res.write(`: connected to job ${normalizedJobId}\n\n`);

    // 2. Reconnection & Missed Events Replay
    const rawLastEventId =
      req.headers['last-event-id'] ||
      req.query?.lastEventId ||
      options.lastEventId ||
      null;

    if (rawLastEventId) {
      // Client is reconnecting: replay missed events after this ID
      this._replayMissedEvents(normalizedJobId, rawLastEventId, res);
    } else if (replayHistory) {
      // Fresh client connection: replay recent buffer to sync state immediately
      this._replayBuffer(normalizedJobId, res);
    }

    // 3. Heartbeat Keep-Alive
    const heartbeatTimer = setInterval(() => {
      try {
        if (!res.writableEnded) {
          res.write(': keep-alive\n\n');
        }
      } catch (_) {
        clearInterval(heartbeatTimer);
      }
    }, this.heartbeatIntervalMs);

    // Unref so test runner or process is not held open by heartbeats
    if (typeof heartbeatTimer.unref === 'function') {
      heartbeatTimer.unref();
    }

    // 4. Register Subscriber
    if (!this.subscribers.has(normalizedJobId)) {
      this.subscribers.set(normalizedJobId, new Set());
    }

    const clientRecord = {
      id: `client_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`,
      res,
      heartbeatTimer,
      connectedAt: Date.now()
    };

    this.subscribers.get(normalizedJobId).add(clientRecord);

    // 5. Clean Teardown on Disconnect
    const cleanup = () => {
      clearInterval(heartbeatTimer);
      const clientSet = this.subscribers.get(normalizedJobId);
      if (clientSet) {
        clientSet.delete(clientRecord);
        if (clientSet.size === 0) {
          this.subscribers.delete(normalizedJobId);
        }
      }
    };

    req.on('close', cleanup);
    req.on('finish', cleanup);
    res.on('close', cleanup);

    return clientRecord;
  }

  /**
   * Replays missed events when a client reconnects with Last-Event-ID.
   */
  _replayMissedEvents(jobId, lastEventId, res) {
    const buffer = this.jobBuffers.get(jobId) || [];
    if (buffer.length === 0) return;

    // Find index of last seen event
    let lastSeenIndex = -1;
    for (let i = 0; i < buffer.length; i++) {
      if (
        buffer[i].eventId === lastEventId ||
        String(buffer[i].sequenceNumber) === String(lastEventId)
      ) {
        lastSeenIndex = i;
        break;
      }
    }

    // Replay all events after lastSeenIndex
    const eventsToReplay = lastSeenIndex >= 0 ? buffer.slice(lastSeenIndex + 1) : buffer;

    for (const evt of eventsToReplay) {
      res.write(this._formatSseMessage(evt));
    }
  }

  /**
   * Replays entire in-memory buffer to a newly connected client.
   */
  _replayBuffer(jobId, res) {
    const buffer = this.jobBuffers.get(jobId) || [];
    for (const evt of buffer) {
      res.write(this._formatSseMessage(evt));
    }
  }

  /**
   * Returns recent event history for a job.
   */
  getEventHistory(jobId, sinceSequence = 0) {
    const buffer = this.jobBuffers.get(String(jobId)) || [];
    if (sinceSequence <= 0) return [...buffer];
    return buffer.filter((e) => e.sequenceNumber > Number(sinceSequence));
  }

  /**
   * Retrieves current highest sequence number for a job.
   */
  getHighestSequence(jobId) {
    return this.jobSequences.get(String(jobId)) || 0;
  }

  /**
   * Cleans up all resources for a specific job (e.g. after completion).
   */
  clearJob(jobId) {
    const normalizedJobId = String(jobId);
    const clients = this.subscribers.get(normalizedJobId);
    if (clients) {
      for (const client of clients) {
        clearInterval(client.heartbeatTimer);
      }
      this.subscribers.delete(normalizedJobId);
    }
    this.jobBuffers.delete(normalizedJobId);
    this.jobSequences.delete(normalizedJobId);
  }

  /**
   * Clears all in-memory buffers and subscribers (primarily for test teardown).
   */
  clearAll() {
    for (const [, clients] of this.subscribers) {
      for (const client of clients) {
        clearInterval(client.heartbeatTimer);
      }
    }
    this.subscribers.clear();
    this.jobBuffers.clear();
    this.jobSequences.clear();
    this.emitter.removeAllListeners();
  }
}

export const defaultAutomationEventService = new AutomationEventService();
export default AutomationEventService;
