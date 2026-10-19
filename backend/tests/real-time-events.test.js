/**
 * Real-Time Automation Event System Test Suite
 * Applier 2.0 — Phase 18: Real-Time Automation Event System
 *
 * Core Principle:
 * "Events are notifications. MongoDB remains durable source of truth.
 * Do not rely exclusively on WebSocket/SSE state."
 *
 * Required Tests Covered:
 * 1. connection: SSE subscription connection, headers, initial acknowledgment, and live event streaming.
 * 2. reconnection: Client disconnects and reconnects with Last-Event-ID; server replays missed events.
 * 3. event ordering: Monotonic sequence numbers guarantee deterministic, strict event ordering.
 * 4. duplicate event: Consumer deduplicator safely detects and drops duplicate eventId or stale sequence numbers.
 * 5. missed event: Sequence gaps are detected and caught up via replay buffer or durable MongoDB state.
 * 6. job restart: Worker restart / resumption reconciles event stream with durable MongoDB truth.
 */

import { jest } from '@jest/globals';
import EventEmitter from 'events';
import {
  AutomationEventService,
  AutomationEventDeduplicator
} from '../src/events/index.js';
import {
  AutomationEventType,
  validateAutomationEvent
} from '../../shared/src/index.js';

describe('Applier 2.0 — Phase 18: Real-Time Automation Event System', () => {
  let eventService;

  beforeEach(() => {
    eventService = new AutomationEventService({
      maxBufferSize: 50,
      heartbeatIntervalMs: 5000
    });
  });

  afterEach(() => {
    if (eventService) {
      eventService.clearAll();
    }
  });

  // Helper to create a mock Express response object that captures SSE chunks
  function createMockSseResponse() {
    const res = new EventEmitter();
    res.chunks = [];
    res.headers = {};
    res.statusCode = 0;
    res.writableEnded = false;

    res.writeHead = (status, headers) => {
      res.statusCode = status;
      res.headers = { ...headers };
    };

    res.write = (chunk) => {
      res.chunks.push(chunk);
      res.emit('chunk', chunk);
      return true;
    };

    res.end = () => {
      res.writableEnded = true;
      res.emit('close');
    };

    return res;
  }

  // Helper to create a mock Express request object
  function createMockRequest(headers = {}, query = {}) {
    const req = new EventEmitter();
    req.headers = { ...headers };
    req.query = { ...query };
    return req;
  }

  // Helper to parse SSE wire messages from response chunks
  function parseSseEvents(chunks) {
    const raw = chunks.join('');
    const blocks = raw.split('\n\n').filter((b) => b.trim() && !b.startsWith(':'));
    const parsed = [];

    for (const block of blocks) {
      const lines = block.split('\n');
      let id = null;
      let eventType = null;
      let data = null;

      for (const line of lines) {
        if (line.startsWith('id: ')) id = line.slice(4).trim();
        else if (line.startsWith('event: ')) eventType = line.slice(7).trim();
        else if (line.startsWith('data: ')) {
          try {
            data = JSON.parse(line.slice(6));
          } catch (_) {
            data = line.slice(6);
          }
        }
      }

      if (id && data) {
        parsed.push({ id, eventType, data });
      }
    }

    return parsed;
  }

  // ─────────────────────────────────────────────────────────────
  // 1. TEST: CONNECTION
  // ─────────────────────────────────────────────────────────────
  describe('1. Connection', () => {
    it('should establish SSE stream with correct headers and stream live events', () => {
      const jobId = 'job_conn_001';
      const req = createMockRequest();
      const res = createMockSseResponse();

      // Subscribe client
      eventService.subscribe(jobId, req, res);

      // Verify HTTP Headers
      expect(res.statusCode).toBe(200);
      expect(res.headers['Content-Type']).toBe('text/event-stream');
      expect(res.headers['Cache-Control']).toContain('no-cache');
      expect(res.headers['Connection']).toBe('keep-alive');

      // Verify initial connection acknowledgment comment
      expect(res.chunks[0]).toContain(`: connected to job ${jobId}`);

      // Emit live events
      const evt1 = eventService.emitEvent({
        jobId,
        eventType: AutomationEventType.JOB_CREATED,
        payload: { targetUrl: 'https://admissions.example.edu/form' }
      });

      const evt2 = eventService.emitEvent({
        jobId,
        eventType: AutomationEventType.JOB_STARTED,
        payload: { totalSteps: 5 }
      });

      const parsed = parseSseEvents(res.chunks);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].eventType).toBe(AutomationEventType.JOB_CREATED);
      expect(parsed[0].data.sequenceNumber).toBe(1);
      expect(parsed[1].eventType).toBe(AutomationEventType.JOB_STARTED);
      expect(parsed[1].data.sequenceNumber).toBe(2);

      // Validate Canonical Contract
      expect(validateAutomationEvent(evt1).valid).toBe(true);
      expect(validateAutomationEvent(evt2).valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. TEST: RECONNECTION
  // ─────────────────────────────────────────────────────────────
  describe('2. Reconnection', () => {
    it('should replay missed events when client reconnects with Last-Event-ID', () => {
      const jobId = 'job_reconn_002';

      // 1. First connection
      const req1 = createMockRequest();
      const res1 = createMockSseResponse();
      eventService.subscribe(jobId, req1, res1);

      // Emits events 1 and 2
      const evt1 = eventService.emitEvent({
        jobId,
        eventType: AutomationEventType.JOB_CREATED,
        payload: { step: 0 }
      });
      const evt2 = eventService.emitEvent({
        jobId,
        eventType: AutomationEventType.JOB_STARTED,
        payload: { step: 1 }
      });

      // 2. Client disconnects after event 2
      res1.end();

      // 3. Server emits events 3, 4, 5 while client is disconnected
      const evt3 = eventService.emitEvent({
        jobId,
        eventType: AutomationEventType.FIELD_FILLED,
        payload: { field: 'fullName', value: 'Rahul Sharma' }
      });
      const evt4 = eventService.emitEvent({
        jobId,
        eventType: AutomationEventType.FIELD_VERIFIED,
        payload: { field: 'fullName', status: 'PASSED' }
      });
      const evt5 = eventService.emitEvent({
        jobId,
        eventType: AutomationEventType.CHECKPOINT_REQUIRED,
        payload: { checkpointId: 'chk_99' }
      });

      // 4. Client reconnects with Last-Event-ID from event 2
      const req2 = createMockRequest({ 'last-event-id': evt2.eventId });
      const res2 = createMockSseResponse();
      eventService.subscribe(jobId, req2, res2);

      // Reconnection should replay events 3, 4, 5 in exact sequence
      const replayed = parseSseEvents(res2.chunks);
      expect(replayed).toHaveLength(3);
      expect(replayed[0].id).toBe(evt3.eventId);
      expect(replayed[0].data.sequenceNumber).toBe(3);
      expect(replayed[0].eventType).toBe(AutomationEventType.FIELD_FILLED);

      expect(replayed[1].id).toBe(evt4.eventId);
      expect(replayed[1].data.sequenceNumber).toBe(4);
      expect(replayed[1].eventType).toBe(AutomationEventType.FIELD_VERIFIED);

      expect(replayed[2].id).toBe(evt5.eventId);
      expect(replayed[2].data.sequenceNumber).toBe(5);
      expect(replayed[2].eventType).toBe(AutomationEventType.CHECKPOINT_REQUIRED);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. TEST: EVENT ORDERING
  // ─────────────────────────────────────────────────────────────
  describe('3. Event Ordering', () => {
    it('should assign strictly monotonic sequence numbers and preserve total order', () => {
      const jobId = 'job_ordering_003';
      const eventTypes = [
        AutomationEventType.JOB_CREATED,
        AutomationEventType.JOB_STARTED,
        AutomationEventType.PAGE_CHANGED,
        AutomationEventType.FIELD_DETECTED,
        AutomationEventType.FIELD_MAPPED,
        AutomationEventType.FIELD_FILLED,
        AutomationEventType.FIELD_VERIFIED,
        AutomationEventType.DOCUMENT_UPLOADED,
        AutomationEventType.CHECKPOINT_REQUIRED,
        AutomationEventType.SUBMISSION_STARTED,
        AutomationEventType.SUBMISSION_VERIFIED,
        AutomationEventType.JOB_COMPLETED
      ];

      const emitted = eventTypes.map((type, idx) =>
        eventService.emitEvent({
          jobId,
          eventType: type,
          payload: { index: idx }
        })
      );

      // Verify strict monotonic ordering: 1, 2, 3, 4 ...
      for (let i = 0; i < emitted.length; i++) {
        expect(emitted[i].sequenceNumber).toBe(i + 1);
        expect(emitted[i].eventType).toBe(eventTypes[i]);
      }

      // Consumer verifies order
      const deduplicator = new AutomationEventDeduplicator();
      for (const evt of emitted) {
        const result = deduplicator.process(evt);
        expect(result.accepted).toBe(true);
        expect(result.hasGap).toBe(false);
      }

      expect(deduplicator.getProcessedEvents()).toHaveLength(eventTypes.length);
      expect(deduplicator.lastSequenceNumber).toBe(eventTypes.length);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. TEST: DUPLICATE EVENT
  // ─────────────────────────────────────────────────────────────
  describe('4. Duplicate Event', () => {
    it('should safely detect and drop duplicate events without mutating consumer state', () => {
      const deduplicator = new AutomationEventDeduplicator();

      const event1 = {
        schemaVersion: '2.0.0',
        eventId: 'evt_dup_001',
        sequenceNumber: 1,
        eventType: AutomationEventType.JOB_STARTED,
        jobId: 'job_dup',
        timestamp: new Date().toISOString(),
        payload: { msg: 'First' }
      };

      const event2 = {
        schemaVersion: '2.0.0',
        eventId: 'evt_dup_002',
        sequenceNumber: 2,
        eventType: AutomationEventType.FIELD_FILLED,
        jobId: 'job_dup',
        timestamp: new Date().toISOString(),
        payload: { msg: 'Second' }
      };

      // 1. Process initial events
      const res1 = deduplicator.process(event1);
      expect(res1.accepted).toBe(true);
      expect(res1.isDuplicate).toBe(false);

      const res2 = deduplicator.process(event2);
      expect(res2.accepted).toBe(true);
      expect(res2.isDuplicate).toBe(false);

      // 2. Duplicate transmission of event 1 (same eventId, older sequence)
      const resDuplicate1 = deduplicator.process(event1);
      expect(resDuplicate1.accepted).toBe(false);
      expect(resDuplicate1.isDuplicate).toBe(true);
      expect(resDuplicate1.reason).toBe('DUPLICATE_EVENT_ID');

      // 3. Repeated event with new ID but duplicate/lower sequence number
      const resDuplicateSeq = deduplicator.process({
        ...event2,
        eventId: 'evt_dup_003_alt',
        sequenceNumber: 2
      });
      expect(resDuplicateSeq.accepted).toBe(false);
      expect(resDuplicateSeq.isDuplicate).toBe(true);
      expect(resDuplicateSeq.reason).toBe('STALE_OR_DUPLICATE_SEQUENCE');

      // Processed events must only contain the 2 unique accepted events
      expect(deduplicator.getProcessedEvents()).toHaveLength(2);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. TEST: MISSED EVENT
  // ─────────────────────────────────────────────────────────────
  describe('5. Missed Event', () => {
    it('should detect gaps in sequence numbers and trigger catch-up from buffer or durable store', () => {
      const jobId = 'job_missed_005';
      const deduplicator = new AutomationEventDeduplicator();

      // Emit events 1, 2, 3, 4 on server
      const evt1 = eventService.emitEvent({
        jobId,
        eventType: AutomationEventType.JOB_CREATED,
        payload: { seq: 1 }
      });
      const evt2 = eventService.emitEvent({
        jobId,
        eventType: AutomationEventType.JOB_STARTED,
        payload: { seq: 2 }
      });
      const evt3 = eventService.emitEvent({
        jobId,
        eventType: AutomationEventType.FIELD_FILLED,
        payload: { seq: 3 }
      });
      const evt4 = eventService.emitEvent({
        jobId,
        eventType: AutomationEventType.FIELD_VERIFIED,
        payload: { seq: 4 }
      });

      // Consumer processes event 1
      const res1 = deduplicator.process(evt1);
      expect(res1.accepted).toBe(true);
      expect(res1.hasGap).toBe(false);

      // Network drops events 2 and 3; consumer receives event 4 directly
      const res4 = deduplicator.process(evt4);
      expect(res4.accepted).toBe(true);
      expect(res4.hasGap).toBe(true);
      expect(res4.missedRange).toEqual({ from: 2, to: 3, count: 2 });

      // Consumer catches up by querying event buffer history
      const missedEvents = eventService.getEventHistory(jobId, res1.event.sequenceNumber);
      expect(missedEvents).toHaveLength(3); // events 2, 3, 4

      // Reconcile missed events 2 and 3 into consumer
      const catchup2 = deduplicator.process(evt2);
      // Because sequence 4 was already seen, deduplicator flags sequence 2 as stale/historical
      expect(catchup2.isDuplicate).toBe(true);

      // Verify that all events exist in the durable buffer
      const allHistory = eventService.getEventHistory(jobId, 0);
      expect(allHistory.map((e) => e.sequenceNumber)).toEqual([1, 2, 3, 4]);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. TEST: JOB RESTART
  // ─────────────────────────────────────────────────────────────
  describe('6. Job Restart', () => {
    it('should reconcile restarted job with durable state and continue event stream cleanly', async () => {
      const jobId = 'job_restart_006';

      // 1. Initial execution before restart
      eventService.emitEvent({
        jobId,
        eventType: AutomationEventType.JOB_CREATED,
        payload: { step: 0 }
      });
      eventService.emitEvent({
        jobId,
        eventType: AutomationEventType.JOB_STARTED,
        payload: { step: 1 }
      });
      eventService.emitEvent({
        jobId,
        eventType: AutomationEventType.USER_INPUT_REQUIRED,
        payload: { pauseReason: 'OTP', fieldName: 'otp_field' }
      });

      // 2. Mock durable MongoDB state representing the paused/saved job
      const durableJobState = {
        _id: jobId,
        status: 'PAUSED_OTP',
        currentStepIndex: 2,
        pauseContext: { pauseReason: 'OTP', fieldName: 'otp_field', stepIndex: 2 },
        logs: [
          { message: 'Job created' },
          { message: 'Execution started' },
          { message: 'Paused for OTP' }
        ]
      };

      // 3. Worker restarts / Resumes job from durable state
      // Re-establishes execution and emits restart/resumption event
      const resumptionEvent = eventService.emitEvent({
        jobId,
        eventType: AutomationEventType.JOB_STARTED,
        payload: {
          resumedFromStep: durableJobState.currentStepIndex,
          resumptionReason: 'WORKER_RESTART',
          durableStatus: durableJobState.status
        }
      });

      expect(resumptionEvent.sequenceNumber).toBe(4);
      expect(resumptionEvent.eventType).toBe(AutomationEventType.JOB_STARTED);
      expect(resumptionEvent.payload.resumptionReason).toBe('WORKER_RESTART');

      // 4. Continued execution continues monotonic sequence
      const step4 = eventService.emitEvent({
        jobId,
        eventType: AutomationEventType.FIELD_FILLED,
        payload: { field: 'otp_field', value: '123456' }
      });
      const step5 = eventService.emitEvent({
        jobId,
        eventType: AutomationEventType.JOB_COMPLETED,
        payload: { completedAt: new Date().toISOString() }
      });

      expect(step4.sequenceNumber).toBe(5);
      expect(step5.sequenceNumber).toBe(6);

      // Verify that full event history is retrievable
      const history = eventService.getEventHistory(jobId);
      expect(history).toHaveLength(6);
      expect(history[history.length - 1].eventType).toBe(AutomationEventType.JOB_COMPLETED);
    });
  });
});
