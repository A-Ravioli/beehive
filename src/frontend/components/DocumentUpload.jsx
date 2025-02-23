import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

function DocumentUpload({ onUploadComplete }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null);

  const onDrop = useCallback(async (acceptedFiles) => {
    setUploading(true);
    setProgress({ total: acceptedFiles.length, current: 0, processed: [] });

    try {
      for (const file of acceptedFiles) {
        const formData = new FormData();
        formData.append('document', file);

        const response = await fetch('/collector/process', {
          method: 'POST',
          body: formData
        });

        const result = await response.json();
        
        if (result.success) {
          setProgress(prev => ({
            ...prev,
            current: prev.current + 1,
            processed: [...prev.processed, { 
              name: file.name, 
              success: true 
            }]
          }));
        } else {
          setProgress(prev => ({
            ...prev,
            current: prev.current + 1,
            processed: [...prev.processed, { 
              name: file.name, 
              success: false, 
              error: result.reason 
            }]
          }));
        }
      }

      if (onUploadComplete) {
        onUploadComplete(progress.processed);
      }
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  }, [onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: uploading
  });

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <div>
            <p className="text-lg mb-2">Processing files...</p>
            <p className="text-sm text-gray-500">
              {progress.current} of {progress.total} files processed
            </p>
          </div>
        ) : isDragActive ? (
          <p className="text-lg">Drop the files here...</p>
        ) : (
          <div>
            <p className="text-lg mb-2">
              Drag & drop files here, or click to select files
            </p>
            <p className="text-sm text-gray-500">
              Supports PDF, DOCX, TXT, and more
            </p>
          </div>
        )}
      </div>

      {progress && progress.processed.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3">Upload Results</h3>
          <div className="space-y-2">
            {progress.processed.map((file, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg flex items-center justify-between
                  ${file.success ? 'bg-green-50' : 'bg-red-50'}`}
              >
                <span className="truncate flex-1">{file.name}</span>
                {file.success ? (
                  <span className="text-green-600 ml-3">✓</span>
                ) : (
                  <span className="text-red-600 ml-3" title={file.error}>
                    ✗
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentUpload; 