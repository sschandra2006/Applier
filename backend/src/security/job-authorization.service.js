/**
 * Job Authorization & User Isolation Service
 * Applier 2.0 — Phase 23: Security Hardening
 *
 * Enforces strict user isolation:
 * - Prevents cross-user access to automation jobs, browser sessions, and applicant documents.
 * - Guarantees non-admin users can only view and mutate their own resources.
 */

export class UnauthorizedAccessError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'UnauthorizedAccessError';
    this.code = details.code || 'UNAUTHORIZED_RESOURCE_ACCESS';
    this.status = 403;
    this.details = details;
  }
}

export class JobAuthorizationService {
  /**
   * Verifies that the requesting user owns the automation job.
   *
   * @param {object} reqUser Authenticated user object from req.user
   * @param {object} job AutomationJob document or object with userId
   * @returns {boolean} True if authorized
   */
  static authorizeJobAccess(reqUser, job) {
    if (!reqUser) {
      throw new UnauthorizedAccessError('Authentication required to access job.', {
        code: 'UNAUTHENTICATED'
      });
    }

    if (!job) {
      const err = new Error('Job not found.');
      err.status = 404;
      throw err;
    }

    const jobUserId = job.userId?._id ? String(job.userId._id) : String(job.userId || '');
    const currentUserId = String(reqUser._id || reqUser.id || '');

    // Allow owner or system ADMIN
    if (jobUserId === currentUserId || reqUser.role === 'ADMIN') {
      return true;
    }

    throw new UnauthorizedAccessError(
      `Access denied: User "${currentUserId}" is not authorized to access job "${job._id || job.id}" owned by "${jobUserId}".`,
      {
        code: 'UNAUTHORIZED_JOB_ACCESS',
        jobId: job._id || job.id,
        ownerId: jobUserId,
        requesterId: currentUserId
      }
    );
  }

  /**
   * Verifies that the requesting user owns the applicant document.
   * Strictly prevents cross-user document access.
   *
   * @param {object} reqUser Authenticated user object
   * @param {object} document Document record with userId
   * @returns {boolean} True if authorized
   */
  static authorizeDocumentAccess(reqUser, document) {
    if (!reqUser) {
      throw new UnauthorizedAccessError('Authentication required to access document.', {
        code: 'UNAUTHENTICATED'
      });
    }

    if (!document) {
      const err = new Error('Document not found.');
      err.status = 404;
      throw err;
    }

    const docUserId = document.userId?._id ? String(document.userId._id) : String(document.userId || '');
    const currentUserId = String(reqUser._id || reqUser.id || '');

    if (docUserId === currentUserId || reqUser.role === 'ADMIN') {
      return true;
    }

    throw new UnauthorizedAccessError(
      `Access denied: Cross-user document access prohibited for document "${document._id || document.id}".`,
      {
        code: 'CROSS_USER_DOCUMENT_ACCESS',
        documentId: document._id || document.id,
        ownerId: docUserId,
        requesterId: currentUserId
      }
    );
  }
}

export const defaultJobAuthorizationService = JobAuthorizationService;
