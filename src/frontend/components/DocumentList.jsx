import React, { useState, useEffect } from 'react';

function DocumentList() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const response = await fetch('/collector/documents');
      const data = await response.json();
      setDocuments(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching documents:', err);
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const deleteDocument = async (documentId) => {
    try {
      const response = await fetch(`/collector/documents/${documentId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setDocuments(docs => docs.filter(doc => doc.id !== documentId));
      } else {
        throw new Error('Failed to delete document');
      }
    } catch (err) {
      console.error('Error deleting document:', err);
      setError('Failed to delete document');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-600 p-4">
        {error}
      </div>
    );
  }

  if (!documents.length) {
    return (
      <div className="text-center text-gray-500 p-4">
        No documents found
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {documents.map(doc => (
        <div
          key={doc.id}
          className="bg-white shadow rounded-lg p-4 flex items-center justify-between"
        >
          <div className="flex-1">
            <h3 className="text-lg font-medium">{doc.title}</h3>
            <div className="text-sm text-gray-500 mt-1">
              <span>{new Date(doc.published).toLocaleDateString()}</span>
              <span className="mx-2">•</span>
              <span>{doc.wordCount} words</span>
              {doc.type && (
                <>
                  <span className="mx-2">•</span>
                  <span>{doc.type}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => window.open(doc.url, '_blank')}
              className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
            >
              View
            </button>
            <button
              onClick={() => deleteDocument(doc.id)}
              className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default DocumentList; 