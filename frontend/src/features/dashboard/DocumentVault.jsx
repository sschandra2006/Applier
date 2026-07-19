import React, { useState, useEffect } from 'react';
import { FileUp, File, Plus, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { fetchDocumentsApi, uploadDocumentApi, deleteDocumentApi } from './services/documents.api.js';

const REQUIRED_DOCS = [
  { id: 'AADHAAR', label: 'Aadhaar Card' },
  { id: 'PAN', label: 'PAN Card' },
  { id: 'RESUME', label: 'Resume' },
  { id: 'PASSPORT', label: 'Passport' },
  { id: 'SSC_MEMO', label: '10th Marksheet' },
];

export default function DocumentVault() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const [error, setError] = useState(null);

  const fetchDocuments = async () => {
    try {
      setError(null);
      const data = await fetchDocumentsApi();
      if (data.success) {
        setDocuments(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch documents', err);
      setError("Failed to load documents.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleUpload = async (e, expectedType) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(expectedType);
    setError(null);

    try {
      const data = await uploadDocumentApi(file, expectedType);
      if (data.success) {
        await fetchDocuments();
      }
    } catch (err) {
      console.error('Upload failed', err);
      setError(err.response?.data?.error || "Failed to upload document.");
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    
    try {
      const data = await deleteDocumentApi(docId);
      if (data.success) {
        await fetchDocuments();
      }
    } catch (err) {
      console.error('Delete failed', err);
      setError("Failed to delete document.");
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Document Vault</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage and verify documents required for AI application filling.</p>
      </header>

      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REQUIRED_DOCS.map((docDef) => {
          const uploadedDoc = documents.find(d => d.type === docDef.id);
          const isUploading = uploading === docDef.id;

          return (
            <motion.div 
              key={docDef.id}
              whileHover={{ y: -2 }}
              className="bg-card border border-border p-5 rounded-xl shadow-sm flex flex-col gap-4 relative group"
            >
              <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${uploadedDoc ? 'bg-primary/10' : 'bg-muted'}`}>
                  <File className={uploadedDoc ? 'text-primary' : 'text-foreground'} size={20} />
                </div>
                {uploadedDoc ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2 py-1 bg-green-500/10 text-green-600 rounded-full flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      Valid
                    </span>
                    <button onClick={() => handleDelete(uploadedDoc._id)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" title="Delete document">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                    </button>
                  </div>
                ) : (
                  <span className="text-xs font-medium px-2 py-1 bg-destructive/10 text-destructive rounded-full flex items-center gap-1">
                    <AlertCircle size={12} />
                    Missing
                  </span>
                )}
              </div>
              <div>
                <h3 className="font-medium text-foreground">{docDef.label}</h3>
                <p className="text-xs text-muted-foreground mt-1 truncate" title={uploadedDoc ? uploadedDoc.fileName : ''}>
                  {uploadedDoc ? uploadedDoc.fileName : 'Not uploaded yet.'}
                </p>
                {uploadedDoc && (
                  <a href={`http://localhost:5000${uploadedDoc.fileUrl}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 block">
                    View Document
                  </a>
                )}
              </div>
              
              {!uploadedDoc && (
                <div className="relative mt-2">
                  <input 
                    type="file" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" 
                    onChange={(e) => handleUpload(e, docDef.id)}
                    disabled={isUploading}
                    accept="image/*,.pdf"
                  />
                  <button 
                    disabled={isUploading}
                    className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border border-border bg-background hover:bg-muted h-9 px-4 py-2 disabled:opacity-50"
                  >
                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <><Plus size={16} className="mr-2" /> Upload</>}
                  </button>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
