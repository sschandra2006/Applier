import React, { useState, useEffect } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Briefcase,
  GraduationCap,
  Wrench,
  FolderGit2,
  Link as LinkIcon,
  Trash2,
  Lock,
  Download,
  ShieldCheck
} from 'lucide-react';
import {
  fetchProfessionalProfileApi,
  verifyProfessionalProfileApi,
  deleteProfileItemApi,
  uploadMasterResumeApi,
  fetchMasterResumesApi,
  downloadMasterResumeApi
} from './services/profile.api.js';

export default function ProfessionalProfileView() {
  const [profile, setProfile] = useState(null);
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('experience');

  const loadData = async () => {
    try {
      setError(null);
      const [profileRes, resumesRes] = await Promise.all([
        fetchProfessionalProfileApi(),
        fetchMasterResumesApi()
      ]);
      if (profileRes.success) setProfile(profileRes.data);
      if (resumesRes.success) setResumes(resumesRes.data);
    } catch (err) {
      console.error('Failed to load profile/resumes:', err);
      setError('Could not load career profile details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['.pdf', '.docx', '.doc', '.txt'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowed.includes(ext)) {
      setError(`Unsupported file format. Please upload a PDF or DOCX resume.`);
      return;
    }

    setUploading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await uploadMasterResumeApi(file);
      if (res.success) {
        setMessage(res.data.message || 'Resume uploaded and career profile extracted successfully.');
        setProfile(res.data.profile);
        await loadData();
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || err.userMessage || 'Failed to parse resume.');
    } finally {
      setUploading(false);
    }
  };

  const handleVerifyProfile = async () => {
    setVerifying(true);
    setError(null);
    setMessage(null);

    try {
      const res = await verifyProfessionalProfileApi();
      if (res.success) {
        setMessage('Profile verified and locked! Generated resumes will use this verified version.');
        await loadData();
      }
    } catch (err) {
      console.error('Verification error:', err);
      setError('Failed to verify profile.');
    } finally {
      setVerifying(false);
    }
  };

  const handleDeleteItem = async (section, itemId) => {
    if (!window.confirm(`Are you sure you want to remove this ${section} entry?`)) return;

    try {
      const res = await deleteProfileItemApi(section, itemId);
      if (res.success) {
        setProfile(prev => ({
          ...prev,
          [section]: (prev[section] || []).filter(item => item.id !== itemId),
          version: (prev.version || 1) + 1
        }));
      }
    } catch (err) {
      console.error('Delete item error:', err);
      setError(`Failed to delete item from ${section}.`);
    }
  };

  const renderProvenanceBadge = (provenance) => {
    const status = provenance?.status || 'UNVERIFIED';
    const isVerified = status === 'VERIFIED';
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
          isVerified
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
        }`}
      >
        {isVerified ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
        {isVerified ? 'Verified by You' : 'Extracted (Unverified)'}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading authoritative career profile...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-card border border-border p-6 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Professional Profile</h1>
            <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-muted text-foreground border border-border">
              v{profile?.version || 1}
            </span>
            {profile?.isVerified ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                <ShieldCheck size={14} /> Verified & Locked
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                <AlertCircle size={14} /> Review Needed
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Authoritative professional record used to derive tailored resumes with zero hallucination.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".pdf,.docx,.doc"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors shadow-sm">
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {uploading ? 'Extracting with AI...' : 'Upload Master Resume'}
            </div>
          </label>

          <button
            onClick={handleVerifyProfile}
            disabled={verifying || profile?.isVerified}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-sm ${
              profile?.isVerified
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {verifying ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
            {profile?.isVerified ? 'Profile Verified' : 'Verify & Lock Profile'}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {message && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-2">
          <CheckCircle2 size={18} />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Basic Contact Info Overview */}
      <div className="bg-card border border-border p-6 rounded-2xl shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{profile?.personalInfo?.fullName || 'Your Name'}</h2>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-1">
              <span>{profile?.personalInfo?.email || 'No email provided'}</span>
              {profile?.personalInfo?.phone && <span>• {profile?.personalInfo?.phone}</span>}
              {profile?.personalInfo?.location?.city && (
                <span>
                  • {profile?.personalInfo?.location?.city}, {profile?.personalInfo?.location?.state}
                </span>
              )}
            </div>
          </div>
          <div>{renderProvenanceBadge(profile?.personalInfo?.provenance)}</div>
        </div>

        {/* Links */}
        {profile?.personalInfo?.links?.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-border">
            {profile.personalInfo.links.map((link, idx) => (
              <a
                key={idx}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline bg-primary/5 px-2.5 py-1 rounded-lg border border-primary/10"
              >
                <LinkIcon size={12} />
                <span>{link.label || 'Link'}</span>
              </a>
            ))}
          </div>
        )}

        {/* Professional Summary */}
        {profile?.professionalSummary?.text && (
          <div className="mt-4 pt-4 border-t border-border">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Professional Summary
            </h3>
            <p className="text-sm text-foreground/90 leading-relaxed">
              {profile.professionalSummary.text}
            </p>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2 overflow-x-auto">
        {[
          { id: 'experience', label: 'Work Experience', icon: Briefcase, count: profile?.experience?.length || 0 },
          { id: 'skills', label: 'Skills', icon: Wrench, count: profile?.skills?.length || 0 },
          { id: 'education', label: 'Education', icon: GraduationCap, count: profile?.education?.length || 0 },
          { id: 'projects', label: 'Projects', icon: FolderGit2, count: profile?.projects?.length || 0 },
          { id: 'vault', label: 'Document Vault', icon: FileText, count: resumes.length }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${isActive ? 'bg-primary-foreground/20' : 'bg-muted'}`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="space-y-4">
        {/* 1. Work Experience */}
        {activeTab === 'experience' && (
          <div className="space-y-4">
            {profile?.experience?.length === 0 ? (
              <div className="p-8 text-center bg-card border border-border rounded-2xl text-muted-foreground text-sm">
                No work experience entries found. Upload your master resume to populate.
              </div>
            ) : (
              profile?.experience?.map((exp) => (
                <div key={exp.id} className="bg-card border border-border p-5 rounded-2xl shadow-sm space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-foreground">{exp.title}</h3>
                      <p className="text-sm font-medium text-muted-foreground">
                        {exp.company} {exp.location && `• ${exp.location}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {exp.startDate} — {exp.endDate}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {renderProvenanceBadge(exp.provenance)}
                      <button
                        onClick={() => handleDeleteItem('experience', exp.id)}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10"
                        title="Delete entry"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {exp.highlights?.length > 0 && (
                    <ul className="space-y-1.5 pl-4 list-disc text-sm text-foreground/90">
                      {exp.highlights.map((h, hIdx) => (
                        <li key={hIdx}>{typeof h === 'string' ? h : h.text}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* 2. Skills */}
        {activeTab === 'skills' && (
          <div className="bg-card border border-border p-6 rounded-2xl shadow-sm">
            {profile?.skills?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center">No skills extracted yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {profile?.skills?.map((sk) => (
                  <div
                    key={sk.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm bg-muted text-foreground border border-border group"
                  >
                    <span>{sk.name}</span>
                    {sk.category && (
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                        ({sk.category})
                      </span>
                    )}
                    <button
                      onClick={() => handleDeleteItem('skills', sk.id)}
                      className="text-muted-foreground hover:text-destructive ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. Education */}
        {activeTab === 'education' && (
          <div className="space-y-4">
            {profile?.education?.length === 0 ? (
              <div className="p-8 text-center bg-card border border-border rounded-2xl text-muted-foreground text-sm">
                No education history found.
              </div>
            ) : (
              profile?.education?.map((edu) => (
                <div key={edu.id} className="bg-card border border-border p-5 rounded-2xl shadow-sm flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-foreground">{edu.degree}</h3>
                    <p className="text-sm font-medium text-muted-foreground">
                      {edu.institution} {edu.fieldOfStudy && `— ${edu.fieldOfStudy}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {edu.startDate} — {edu.endDate} {edu.gpa && `• GPA: ${edu.gpa}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {renderProvenanceBadge(edu.provenance)}
                    <button
                      onClick={() => handleDeleteItem('education', edu.id)}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 4. Projects */}
        {activeTab === 'projects' && (
          <div className="space-y-4">
            {profile?.projects?.length === 0 ? (
              <div className="p-8 text-center bg-card border border-border rounded-2xl text-muted-foreground text-sm">
                No projects listed.
              </div>
            ) : (
              profile?.projects?.map((proj) => (
                <div key={proj.id} className="bg-card border border-border p-5 rounded-2xl shadow-sm space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-foreground">{proj.title}</h3>
                      {proj.url && (
                        <a
                          href={proj.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <LinkIcon size={11} /> {proj.url}
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {renderProvenanceBadge(proj.provenance)}
                      <button
                        onClick={() => handleDeleteItem('projects', proj.id)}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  {proj.description && <p className="text-sm text-foreground/90">{proj.description}</p>}
                  {proj.technologies?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {proj.technologies.map((tech, tIdx) => (
                        <span key={tIdx} className="px-2 py-0.5 bg-muted text-xs rounded-md font-mono">
                          {tech}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* 5. Document Vault Resumes */}
        {activeTab === 'vault' && (
          <div className="space-y-4">
            {resumes.length === 0 ? (
              <div className="p-8 text-center bg-card border border-border rounded-2xl text-muted-foreground text-sm">
                No master resumes stored in the vault yet.
              </div>
            ) : (
              resumes.map((resItem) => (
                <div
                  key={resItem._id}
                  className="bg-card border border-border p-5 rounded-2xl shadow-sm flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                      <FileText size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-foreground">{resItem.originalName}</h4>
                      <p className="text-xs text-muted-foreground">
                        {(resItem.fileSizeBytes / 1024).toFixed(1)} KB • Uploaded on{' '}
                        {new Date(resItem.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => downloadMasterResumeApi(resItem._id, resItem.originalName)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors shadow-sm"
                    >
                      <Download size={14} /> Download Decrypted
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
