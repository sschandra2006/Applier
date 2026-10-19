import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  FileText,
  Shield,
  Lock,
  Unlock,
  Edit2,
  Check,
  X,
  HelpCircle,
  Clock,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Info
} from 'lucide-react';
import {
  fetchApplicationReviewApi,
  resolveConflictApi,
  updateReviewFieldApi,
  confirmApplicationReviewApi
} from '../services/automation.api.js';

export default function ApplicationReviewScreen({
  interviewStateId,
  applicationId,
  onProceedToExecution,
  onBackToChat
}) {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('ALL'); // ALL | CONFLICTS | MISSING | UNCONFIRMED | VERIFIED

  // Inline editing state
  const [editingFieldKey, setEditingFieldKey] = useState(null);
  const [editValue, setEditValue] = useState('');

  // Conflict custom input state
  const [customConflictValues, setCustomConflictValues] = useState({});

  useEffect(() => {
    if (interviewStateId) {
      loadReview();
    }
  }, [interviewStateId]);

  const loadReview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApplicationReviewApi(interviewStateId);
      if (res.success) {
        setReview(res.data);
      } else {
        setError(res.error || 'Failed to load application review.');
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'Error loading review.');
    } finally {
      setLoading(false);
    }
  };

  const handleResolveConflict = async (fieldKey, resolvedValue, chosenSource) => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await resolveConflictApi(interviewStateId, {
        fieldKey,
        resolvedValue,
        chosenSource
      });
      if (res.success) {
        setReview(res.data);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to resolve conflict.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEdit = async (fieldKey) => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await updateReviewFieldApi(interviewStateId, {
        fieldKey,
        value: editValue,
        source: 'USER_INPUT'
      });
      if (res.success) {
        setReview(res.data);
        setEditingFieldKey(null);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to update field value.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExplicitConfirm = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await confirmApplicationReviewApi(interviewStateId, {
        applicationId
      });
      if (res.success) {
        setReview(res.data.review);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to confirm application.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-full">
        <RefreshCw className="animate-spin text-primary mb-3" size={32} />
        <p className="text-sm font-medium text-foreground">Assembling Evidence-Based Review...</p>
        <p className="text-xs text-muted-foreground mt-1">Cross-referencing applicant knowledge graph and document evidence</p>
      </div>
    );
  }

  if (error && !review) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="text-red-500 mx-auto mb-2" size={32} />
        <p className="text-sm font-semibold text-red-600 mb-2">{error}</p>
        <button
          onClick={loadReview}
          className="px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded-md shadow-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  const summary = review?.summary || {
    totalFields: 0,
    verifiedFields: 0,
    missingRequired: 0,
    missingOptional: 0,
    conflictsCount: 0,
    needsConfirmationCount: 0,
    canConfirm: false
  };

  const isConfirmed = review?.status === 'CONFIRMED' && review?.confirmation?.isLocked;
  const isInvalidated = review?.status === 'MUTATED_INVALIDATED';

  // Filter fields
  const filteredFields = (review?.fields || []).filter((f) => {
    if (activeFilter === 'CONFLICTS') return f.status === 'CONFLICT';
    if (activeFilter === 'MISSING') return f.isMissing && f.isRequired;
    if (activeFilter === 'UNCONFIRMED') return f.status === 'CONFIRMATION_REQUIRED';
    if (activeFilter === 'VERIFIED') return f.status === 'VERIFIED';
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden text-foreground">
      {/* 1. Header & Summary Bar */}
      <div className="p-4 border-b border-border bg-card/60 backdrop-blur">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2 text-foreground">
              <Shield className="text-primary" size={18} />
              Evidence-Based Application Review
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Verify values, provenance sources, and confidence metrics prior to live automation submission.
            </p>
          </div>

          {/* Status Badge */}
          <div>
            {isConfirmed ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                <Lock size={12} /> CONFIRMED & LOCKED
              </span>
            ) : isInvalidated ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/30">
                <Unlock size={12} /> MUTATION DETECTED — RECONFIRMATION REQUIRED
              </span>
            ) : summary.canConfirm ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/30">
                READY FOR CONFIRMATION
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/30">
                ACTION REQUIRED
              </span>
            )}
          </div>
        </div>

        {/* Metric Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-border/50 text-xs">
          <div className="p-2 rounded-lg bg-muted/40 border border-border/50">
            <span className="text-muted-foreground block text-[10px] uppercase font-bold">Total Fields</span>
            <span className="font-bold text-foreground text-sm">{summary.totalFields}</span>
          </div>
          <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
            <span className="block text-[10px] uppercase font-bold">Verified</span>
            <span className="font-bold text-sm">{summary.verifiedFields}</span>
          </div>
          <div className={`p-2 rounded-lg border ${summary.conflictsCount > 0 ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400 font-bold' : 'bg-muted/40 border-border/50 text-muted-foreground'}`}>
            <span className="block text-[10px] uppercase font-bold">Conflicts</span>
            <span className="text-sm font-bold">{summary.conflictsCount}</span>
          </div>
          <div className={`p-2 rounded-lg border ${summary.missingRequired > 0 ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400 font-bold' : 'bg-muted/40 border-border/50 text-muted-foreground'}`}>
            <span className="block text-[10px] uppercase font-bold">Missing Required</span>
            <span className="text-sm font-bold">{summary.missingRequired}</span>
          </div>
          <div className="p-2 rounded-lg bg-purple-500/5 border border-purple-500/20 text-purple-700 dark:text-purple-400">
            <span className="block text-[10px] uppercase font-bold">Needs Confirmation</span>
            <span className="text-sm font-bold">{summary.needsConfirmationCount}</span>
          </div>
        </div>

        {/* Filter Navigation Tabs */}
        <div className="flex gap-1.5 mt-3 pt-2 border-t border-border/40 overflow-x-auto">
          {[
            { id: 'ALL', label: `All (${summary.totalFields})` },
            { id: 'CONFLICTS', label: `Conflicts (${summary.conflictsCount})`, alert: summary.conflictsCount > 0 },
            { id: 'MISSING', label: `Missing Required (${summary.missingRequired})`, alert: summary.missingRequired > 0 },
            { id: 'UNCONFIRMED', label: `Needs Confirmation (${summary.needsConfirmationCount})` },
            { id: 'VERIFIED', label: `Verified (${summary.verifiedFields})` }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                activeFilter === tab.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              } ${tab.alert ? 'ring-1 ring-red-400 text-red-600' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="mx-4 mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="hover:opacity-75">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. Review Table / Cards */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredFields.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-xs">
            No fields found under the "{activeFilter}" filter.
          </div>
        ) : (
          filteredFields.map((field) => {
            const isEditing = editingFieldKey === field.fieldKey;
            const hasConflict = field.status === 'CONFLICT' && field.conflict;
            const isMissingRequired = field.isMissing && field.isRequired;

            return (
              <div
                key={field.fieldKey}
                className={`p-3.5 rounded-xl border transition-all shadow-xs ${
                  hasConflict
                    ? 'bg-amber-500/5 border-amber-500/40 ring-1 ring-amber-500/20'
                    : isMissingRequired
                    ? 'bg-red-500/5 border-red-500/30'
                    : field.status === 'CONFIRMATION_REQUIRED'
                    ? 'bg-purple-500/5 border-purple-500/30'
                    : 'bg-card border-border hover:border-border/80'
                }`}
              >
                {/* Field Top Row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{field.label}</span>
                      {field.isRequired ? (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 border border-red-500/20">
                          Required
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          Optional
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground block mt-0.5">
                      {field.fieldKey}
                    </span>
                  </div>

                  {/* Status & Validation Pill */}
                  <div className="flex items-center gap-1.5">
                    {field.status === 'VERIFIED' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <CheckCircle2 size={12} /> Verified
                      </span>
                    )}
                    {field.status === 'CONFLICT' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/30 animate-pulse">
                        <AlertTriangle size={12} /> Conflict Detected
                      </span>
                    )}
                    {field.status === 'CONFIRMATION_REQUIRED' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-600 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                        <HelpCircle size={12} /> Needs Confirmation
                      </span>
                    )}
                    {field.status === 'MISSING' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                        <X size={12} /> Missing
                      </span>
                    )}
                    {field.status === 'OPTIONAL_EMPTY' && (
                      <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        Not Provided
                      </span>
                    )}
                  </div>
                </div>

                {/* ─────────────────────────────────────────────────────────────
                    CONFLICT RESOLUTION SUB-VIEW
                   ───────────────────────────────────────────────────────────── */}
                {hasConflict ? (
                  <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs space-y-3">
                    <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-400">
                      <AlertTriangle size={14} />
                      <span>Conflicting Evidence Detected Across Documents:</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {/* Option A */}
                      <div className="p-2.5 rounded-lg bg-background border border-border flex flex-col justify-between">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                            Option A (Existing Record)
                          </span>
                          <span className="font-semibold text-foreground text-sm block mt-1">
                            {String(field.conflict.existingValue?.value || 'N/A')}
                          </span>
                          <span className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                            <FileText size={11} /> {field.conflict.existingValue?.evidence || 'Document A'}
                          </span>
                          <span className="text-[10px] font-mono text-emerald-600 mt-0.5 block">
                            Confidence: {Math.round((field.conflict.existingValue?.confidence || 0.95) * 100)}%
                          </span>
                        </div>
                        <button
                          disabled={actionLoading || isConfirmed}
                          onClick={() =>
                            handleResolveConflict(
                              field.fieldKey,
                              field.conflict.existingValue?.value,
                              field.conflict.existingValue?.source || 'DOCUMENT'
                            )
                          }
                          className="mt-2.5 w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold transition-colors shadow-xs disabled:opacity-50"
                        >
                          Choose Option A
                        </button>
                      </div>

                      {/* Option B */}
                      <div className="p-2.5 rounded-lg bg-background border border-border flex flex-col justify-between">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                            Option B (Conflicting Record)
                          </span>
                          <span className="font-semibold text-foreground text-sm block mt-1">
                            {String(field.conflict.conflictingValue?.value || 'N/A')}
                          </span>
                          <span className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                            <FileText size={11} /> {field.conflict.conflictingValue?.evidence || 'Document B'}
                          </span>
                          <span className="text-[10px] font-mono text-emerald-600 mt-0.5 block">
                            Confidence: {Math.round((field.conflict.conflictingValue?.confidence || 0.92) * 100)}%
                          </span>
                        </div>
                        <button
                          disabled={actionLoading || isConfirmed}
                          onClick={() =>
                            handleResolveConflict(
                              field.fieldKey,
                              field.conflict.conflictingValue?.value,
                              field.conflict.conflictingValue?.source || 'DOCUMENT'
                            )
                          }
                          className="mt-2.5 w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold transition-colors shadow-xs disabled:opacity-50"
                        >
                          Choose Option B
                        </button>
                      </div>
                    </div>

                    {/* Custom Input Resolution */}
                    <div className="flex items-center gap-2 pt-2 border-t border-amber-500/20">
                      <input
                        type="text"
                        placeholder="Or enter correct value manually..."
                        value={customConflictValues[field.fieldKey] || ''}
                        onChange={(e) =>
                          setCustomConflictValues((prev) => ({ ...prev, [field.fieldKey]: e.target.value }))
                        }
                        className="flex-1 h-8 px-2.5 rounded bg-background border border-border text-xs focus:ring-1 focus:ring-primary"
                      />
                      <button
                        disabled={
                          actionLoading ||
                          isConfirmed ||
                          !customConflictValues[field.fieldKey]?.trim()
                        }
                        onClick={() =>
                          handleResolveConflict(
                            field.fieldKey,
                            customConflictValues[field.fieldKey],
                            'USER_INPUT'
                          )
                        }
                        className="h-8 px-3 bg-primary text-primary-foreground rounded text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        Use Custom
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ─────────────────────────────────────────────────────────────
                     STANDARD FIELD DETAILS (VALUE, SOURCE, CONFIDENCE, VALIDATION)
                     ───────────────────────────────────────────────────────────── */
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 border-t border-border/40 text-xs">
                    {/* VALUE */}
                    <div className="sm:col-span-2">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">
                        Value
                      </span>
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="flex-1 h-7 px-2 text-xs rounded border border-border bg-background focus:ring-1 focus:ring-primary"
                            autoFocus
                          />
                          <button
                            disabled={actionLoading}
                            onClick={() => handleSaveEdit(field.fieldKey)}
                            className="h-7 w-7 bg-primary text-primary-foreground rounded flex items-center justify-center hover:bg-primary/90"
                            title="Save"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            onClick={() => setEditingFieldKey(null)}
                            className="h-7 w-7 bg-muted text-muted-foreground rounded flex items-center justify-center hover:bg-muted/80"
                            title="Cancel"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between group">
                          <span
                            className={`font-mono text-xs font-semibold ${
                              field.value ? 'text-foreground' : 'text-muted-foreground italic'
                            }`}
                          >
                            {field.value !== null && field.value !== undefined
                              ? String(field.value)
                              : '(Empty)'}
                          </span>
                          {!isConfirmed && (
                            <button
                              onClick={() => {
                                setEditingFieldKey(field.fieldKey);
                                setEditValue(field.value || '');
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-primary transition-opacity"
                              title="Edit Value"
                            >
                              <Edit2 size={12} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* SOURCE */}
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">
                        Source
                      </span>
                      <div className="flex items-center gap-1 text-[11px] text-foreground font-medium truncate">
                        <FileText size={11} className="text-muted-foreground shrink-0" />
                        <span className="truncate" title={field.sourceDetails}>
                          {field.sourceDetails || field.source}
                        </span>
                      </div>
                    </div>

                    {/* CONFIDENCE */}
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">
                        Confidence
                      </span>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              field.confidence >= 0.9
                                ? 'bg-emerald-500'
                                : field.confidence >= 0.8
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.round(field.confidence * 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-muted-foreground">
                          {Math.round(field.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 3. Explicit Confirmation & Submission Lock Action Panel */}
      <div className="p-4 border-t border-border bg-card/80 backdrop-blur">
        {isConfirmed ? (
          /* 🔒 LOCKED APPLICATION VIEW */
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3 text-xs">
              <Lock className="text-emerald-600 mt-0.5 shrink-0" size={16} />
              <div className="flex-1">
                <span className="font-bold text-emerald-800 dark:text-emerald-300 block">
                  Application Confirmed & Locked for Submission
                </span>
                <span className="text-muted-foreground text-[11px] block mt-0.5">
                  Values are cryptographically bound to confirmation token. Any subsequent modification will invalidate this token.
                </span>
                <div className="mt-2 font-mono text-[10px] text-muted-foreground space-y-0.5 bg-background/50 p-2 rounded border border-border/50">
                  <div>Token ID: <span className="text-foreground">{review.confirmation.confirmationId}</span></div>
                  <div>Field Hash: <span className="text-foreground">{review.confirmation.fieldStateHash}</span></div>
                  <div>Confirmed At: <span className="text-foreground">{review.confirmation.confirmedAt}</span></div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onBackToChat}
                className="px-4 h-10 border border-border text-foreground hover:bg-muted rounded-lg text-xs font-semibold transition-colors"
              >
                Back to Chat
              </button>
              <button
                onClick={() => onProceedToExecution && onProceedToExecution(review.confirmation.token)}
                className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                <ArrowRight size={14} />
                Deploy Live Automation Execution
              </button>
            </div>
          </div>
        ) : (
          /* UNCONFIRMED STATE */
          <div className="flex items-center justify-between gap-4">
            <div>
              {!summary.canConfirm ? (
                <div className="text-xs text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5">
                  <AlertTriangle size={14} />
                  <span>
                    Resolve all {summary.conflictsCount > 0 ? `${summary.conflictsCount} conflict(s)` : ''}{' '}
                    {summary.missingRequired > 0 ? `and ${summary.missingRequired} required field(s)` : ''} to confirm.
                  </span>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Info size={14} className="text-blue-500" />
                  <span>Review all fields carefully before locking the application.</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onBackToChat}
                className="px-4 h-10 border border-border text-foreground hover:bg-muted rounded-lg text-xs font-semibold transition-colors"
              >
                Back to Chat
              </button>
              <button
                disabled={!summary.canConfirm || actionLoading}
                onClick={handleExplicitConfirm}
                className="h-10 px-5 bg-primary text-primary-foreground rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? (
                  <RefreshCw className="animate-spin" size={14} />
                ) : (
                  <Lock size={14} />
                )}
                Explicitly Confirm & Lock Application
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
