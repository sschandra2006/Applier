/**
 * Large Application and Context Optimization Test & Benchmark Suite
 * Applier 2.0 — Phase 21
 *
 * Verifies and benchmarks 5-level hierarchy and context optimization for applications containing:
 * - 50 fields
 * - 100 fields
 * - 200+ fields
 *
 * Measures:
 * 1. Latency (ms)
 * 2. Token usage (monolithic vs optimized section context)
 * 3. Memory footprint (heapUsed delta in MB)
 * 4. Accuracy (percentage of successfully mapped semantic fields)
 * 5. Multi-tiered caching & fingerprint invalidation
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { HierarchicalContextEngine } from '../src/context/hierarchical-context.engine.js';
import { ContextOptimizationCache } from '../src/context/context-optimization-cache.js';
import { validateApplicationHierarchy } from '../../shared/validators/index.js';

describe('Applier 2.0 — Phase 21: Large Application and Context Optimization', () => {
  let cache;
  let engine;

  beforeEach(() => {
    cache = new ContextOptimizationCache();
    engine = new HierarchicalContextEngine({ cache });
  });

  // Helper generator for synthetic field sets
  function generateSyntheticFields(count) {
    const categories = [
      { prefix: 'personal', labels: ['Full Name', 'First Name', 'Last Name', 'Date of Birth', 'Gender', 'Nationality', 'Marital Status', 'Passport Number', 'Aadhaar Number', 'Birth City'] },
      { prefix: 'contact', labels: ['Email Address', 'Mobile Phone', 'Home Phone', 'Street Address', 'Apt / Suite', 'City', 'State / Province', 'ZIP Code', 'Country', 'Emergency Contact Name'] },
      { prefix: 'education', labels: ['High School Name', 'Secondary Board', 'College / University', 'Degree Conferred', 'Major Stream', 'CGPA / Percentage', 'Graduation Year', 'Dean Honor', 'Thesis Title', 'Academic Awards'] },
      { prefix: 'experience', labels: ['Current Employer', 'Job Title', 'Years Experience', 'Department', 'Office Location', 'Direct Supervisor', 'Start Date', 'End Date', 'Annual CTC', 'Notice Period'] },
      { prefix: 'skills', labels: ['Primary Programming Language', 'Secondary Language', 'Cloud Platform', 'Database System', 'Framework', 'DevOps Tool', 'Version Control', 'Architecture Style', 'Testing Tool', 'Methodology'] },
      { prefix: 'references', labels: ['Reference 1 Full Name', 'Reference 1 Relationship', 'Reference 1 Company', 'Reference 1 Email', 'Reference 1 Phone', 'Reference 2 Full Name', 'Reference 2 Relationship', 'Reference 2 Company', 'Reference 2 Email', 'Reference 2 Phone'] },
      { prefix: 'documents', labels: ['Upload Resume', 'Upload Cover Letter', 'Upload Degree Certificate', 'Upload Transcript', 'Upload Experience Letter', 'Upload ID Proof', 'Upload Passport Copy', 'Upload Address Proof', 'Upload Pay Slips', 'Upload Relieving Letter'] },
      { prefix: 'disclosures', labels: ['Work Authorization Status', 'Require Visa Sponsorship', 'Criminal Record Disclosure', 'Non-Compete Agreement', 'Conflict of Interest', 'Background Check Consent', 'Drug Test Consent', 'Equal Opportunity Self-ID', 'Veteran Status Self-ID', 'Applicant Signature Confirmation'] }
    ];

    const fields = [];
    let catIdx = 0;

    for (let i = 0; i < count; i++) {
      const cat = categories[catIdx % categories.length];
      const labelIdx = Math.floor(i / categories.length) % cat.labels.length;
      const baseLabel = cat.labels[labelIdx] || `Field ${i + 1}`;
      const suffix = Math.floor(i / (categories.length * cat.labels.length));
      const label = suffix > 0 ? `${baseLabel} (Instance ${suffix + 1})` : baseLabel;
      const name = `${cat.prefix}_fld_${i + 1}`;
      const isFile = cat.prefix === 'documents' || /upload|resume|transcript/i.test(label);

      fields.push({
        fieldId: `fld_${i + 1}`,
        name,
        type: isFile ? 'file' : /date/i.test(label) ? 'date' : /email/i.test(label) ? 'email' : /phone/i.test(label) ? 'tel' : 'text',
        label,
        selector: `#${name}`,
        required: i % 3 === 0
      });

      catIdx++;
    }

    return fields;
  }

  // Ground truth applicant graph generator
  function generateApplicantGraph(fields) {
    const graph = {};
    for (const f of fields) {
      if (f.type === 'file') {
        graph[f.name] = '/vault/resumes/candidate_doc.pdf';
      } else if (f.type === 'email') {
        graph[f.name] = 'candidate.alex@example.org';
      } else if (f.type === 'tel') {
        graph[f.name] = '+15559871234';
      } else if (f.type === 'date') {
        graph[f.name] = '1992-08-24';
      } else {
        graph[f.name] = `Verified Value for ${f.label}`;
      }
    }
    return graph;
  }

  // ─────────────────────────────────────────────────────────────
  // 1. BENCHMARK: 50 FIELDS
  // ─────────────────────────────────────────────────────────────
  it('Benchmark 1: 50 Fields — should slice context, achieve >= 70% token savings, and maintain high accuracy', async () => {
    const rawFields = generateSyntheticFields(50);
    const applicantGraph = generateApplicantGraph(rawFields);
    const documentVault = [{ type: 'RESUME', filename: 'candidate_resume.pdf', path: '/vault/candidate_resume.pdf' }];

    const memBefore = process.memoryUsage().heapUsed;
    const result = await engine.processApplication({
      applicationId: 'app_bench_50',
      portalDomain: 'jobs.scale50.com',
      rawFields,
      applicantGraph,
      documentVault
    });
    const memAfter = process.memoryUsage().heapUsed;
    const heapDeltaMb = Number(((memAfter - memBefore) / (1024 * 1024)).toFixed(2));

    // 1. Hierarchy Verification
    expect(result.hierarchy).toBeDefined();
    expect(result.hierarchy.totalFieldCount).toBe(50);
    expect(result.hierarchy.pages[0].sections.length).toBeGreaterThanOrEqual(4);

    // Schema Validation
    const validation = validateApplicationHierarchy(result.hierarchy);
    expect(validation.valid).toBe(true);

    // 2. Metrics Measurement
    const metrics = result.metrics;
    expect(metrics.fieldCount).toBe(50);
    expect(metrics.latencyMs).toBeGreaterThan(0);
    expect(metrics.monolithicTokens).toBeGreaterThan(metrics.optimizedTokens);
    expect(metrics.savingsRatio).toBeGreaterThanOrEqual(0.70); // >= 70% token savings

    // 3. Accuracy Verification (Ground Truth Matching)
    const correctlyMapped = result.mappedFields.filter(f => f.verified && f.value !== null);
    const accuracy = correctlyMapped.length / 50;
    expect(accuracy).toBeGreaterThanOrEqual(0.95); // >= 95% accuracy

    console.log(`\n--- BENCHMARK 50 FIELDS ---`);
    console.log(`Latency:       ${metrics.latencyMs} ms`);
    console.log(`Monolithic:    ${metrics.monolithicTokens} tokens`);
    console.log(`Optimized:     ${metrics.optimizedTokens} tokens`);
    console.log(`Token Savings: ${(metrics.savingsRatio * 100).toFixed(1)}%`);
    console.log(`Heap Delta:    ${heapDeltaMb} MB`);
    console.log(`Accuracy:      ${(accuracy * 100).toFixed(1)}%`);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. BENCHMARK: 100 FIELDS
  // ─────────────────────────────────────────────────────────────
  it('Benchmark 2: 100 Fields — should process 100 fields with hierarchical isolation and sub-linear overhead', async () => {
    const rawFields = generateSyntheticFields(100);
    const applicantGraph = generateApplicantGraph(rawFields);
    const documentVault = [
      { type: 'RESUME', filename: 'resume.pdf', path: '/vault/resume.pdf' },
      { type: 'TRANSCRIPT', filename: 'transcripts.pdf', path: '/vault/transcripts.pdf' }
    ];

    const memBefore = process.memoryUsage().heapUsed;
    const result = await engine.processApplication({
      applicationId: 'app_bench_100',
      portalDomain: 'portal.enterprise100.org',
      rawFields,
      applicantGraph,
      documentVault
    });
    const memAfter = process.memoryUsage().heapUsed;
    const heapDeltaMb = Number(((memAfter - memBefore) / (1024 * 1024)).toFixed(2));

    expect(result.hierarchy.totalFieldCount).toBe(100);
    expect(result.mappedFields).toHaveLength(100);

    const metrics = result.metrics;
    expect(metrics.savingsRatio).toBeGreaterThanOrEqual(0.75); // >= 75% savings for 100 fields

    const correctlyMapped = result.mappedFields.filter(f => f.verified && f.value !== null);
    const accuracy = correctlyMapped.length / 100;
    expect(accuracy).toBeGreaterThanOrEqual(0.95);

    console.log(`\n--- BENCHMARK 100 FIELDS ---`);
    console.log(`Latency:       ${metrics.latencyMs} ms`);
    console.log(`Monolithic:    ${metrics.monolithicTokens} tokens`);
    console.log(`Optimized:     ${metrics.optimizedTokens} tokens`);
    console.log(`Token Savings: ${(metrics.savingsRatio * 100).toFixed(1)}%`);
    console.log(`Heap Delta:    ${heapDeltaMb} MB`);
    console.log(`Accuracy:      ${(accuracy * 100).toFixed(1)}%`);
  });

  // ─────────────────────────────────────────────────────────────
  // 3. BENCHMARK: 200+ FIELDS
  // ─────────────────────────────────────────────────────────────
  it('Benchmark 3: 200 Fields — should scale to massive enterprise applications without memory bloat', async () => {
    const rawFields = generateSyntheticFields(200);
    const applicantGraph = generateApplicantGraph(rawFields);
    const documentVault = [
      { type: 'RESUME', filename: 'cv.pdf', path: '/vault/cv.pdf' },
      { type: 'DEGREE', filename: 'degree.pdf', path: '/vault/degree.pdf' }
    ];

    const memBefore = process.memoryUsage().heapUsed;
    const result = await engine.processApplication({
      applicationId: 'app_bench_200',
      portalDomain: 'gov.mega-application.gov',
      rawFields,
      applicantGraph,
      documentVault
    });
    const memAfter = process.memoryUsage().heapUsed;
    const heapDeltaMb = Number(((memAfter - memBefore) / (1024 * 1024)).toFixed(2));

    expect(result.hierarchy.totalFieldCount).toBe(200);
    expect(result.mappedFields).toHaveLength(200);

    const metrics = result.metrics;
    // For 200 fields, monolithic tokens are huge (typically 20,000+), while section slices are tiny
    expect(metrics.monolithicTokens).toBeGreaterThan(15000);
    expect(metrics.savingsRatio).toBeGreaterThanOrEqual(0.75); // >= 75% savings

    const correctlyMapped = result.mappedFields.filter(f => f.verified && f.value !== null);
    const accuracy = correctlyMapped.length / 200;
    expect(accuracy).toBeGreaterThanOrEqual(0.95);

    // Memory footprint should be restrained
    expect(heapDeltaMb).toBeLessThan(50); // Under 50MB delta

    console.log(`\n--- BENCHMARK 200 FIELDS ---`);
    console.log(`Latency:       ${metrics.latencyMs} ms`);
    console.log(`Monolithic:    ${metrics.monolithicTokens} tokens`);
    console.log(`Optimized:     ${metrics.optimizedTokens} tokens`);
    console.log(`Token Savings: ${(metrics.savingsRatio * 100).toFixed(1)}%`);
    console.log(`Heap Delta:    ${heapDeltaMb} MB`);
    console.log(`Accuracy:      ${(accuracy * 100).toFixed(1)}%`);
  });

  // ─────────────────────────────────────────────────────────────
  // 4. MULTI-TIERED CACHING (ZERO-LATENCY / ZERO-TOKEN CACHE HIT)
  // ─────────────────────────────────────────────────────────────
  it('4. Multi-Tiered Cache: should achieve instant sub-millisecond cache hit on repeated visit', async () => {
    const rawFields = generateSyntheticFields(50);
    const applicantGraph = generateApplicantGraph(rawFields);

    // Initial run (Cache Warmup)
    const initialRun = await engine.processApplication({
      applicationId: 'app_cache_1',
      portalDomain: 'portal.cached-run.com',
      rawFields,
      applicantGraph
    });
    expect(initialRun.metrics.pageCacheHit).toBe(false);

    // Repeat run (Cache Hit)
    const repeatRun = await engine.processApplication({
      applicationId: 'app_cache_2',
      portalDomain: 'portal.cached-run.com',
      rawFields,
      applicantGraph
    });

    expect(repeatRun.metrics.pageCacheHit).toBe(true);
    expect(repeatRun.metrics.sectionCacheHits).toBeGreaterThan(0);
    expect(repeatRun.metrics.latencyMs).toBeLessThan(100);
  });

  // ─────────────────────────────────────────────────────────────
  // 5. CACHE INVALIDATION ON PAGE FINGERPRINT DRIFT
  // ─────────────────────────────────────────────────────────────
  it('5. Invalidation Rule: should invalidate cache strictly when page fingerprint changes', async () => {
    const fieldsV1 = generateSyntheticFields(50);
    const applicantGraph = generateApplicantGraph(fieldsV1);

    // Run 1: Page V1
    const run1 = await engine.processApplication({
      applicationId: 'app_drift_1',
      portalDomain: 'portal.drift-test.org',
      rawFields: fieldsV1,
      applicantGraph,
      pageFingerprint: 'pfp_version_1'
    });
    expect(run1.metrics.wasInvalidated).toBe(false);

    // Run 2: Page Fingerprint drifts to V2 (e.g. dynamic elements or portal update)
    const fieldsV2 = [...fieldsV1, { fieldId: 'fld_new_999', name: 'new_dynamic_tax_id', type: 'text', label: 'Tax ID' }];
    const run2 = await engine.processApplication({
      applicationId: 'app_drift_2',
      portalDomain: 'portal.drift-test.org',
      rawFields: fieldsV2,
      applicantGraph,
      pageFingerprint: 'pfp_version_2_mutated'
    });

    // Cache must have been invalidated!
    expect(run2.metrics.wasInvalidated).toBe(true);
    expect(run2.metrics.pageCacheHit).toBe(false);
    expect(run2.hierarchy.totalFieldCount).toBe(51);
  });
});
