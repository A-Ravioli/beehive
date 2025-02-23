import React, { useState } from 'react';
import DocumentUpload from '../components/DocumentUpload';
import DocumentList from '../components/DocumentList';
import WebsiteImport from '../components/WebsiteImport';

function Documents() {
  const [activeTab, setActiveTab] = useState('upload');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadComplete = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleImportComplete = () => {
    setRefreshKey(prev => prev + 1);
  };

  const tabs = [
    { id: 'upload', label: 'Upload Files' },
    { id: 'website', label: 'Import Website' },
    { id: 'list', label: 'Documents' }
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <nav className="flex space-x-4" aria-label="Tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-sm font-medium rounded-md ${
                activeTab === tab.id
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="bg-white rounded-lg shadow">
        {activeTab === 'upload' && (
          <DocumentUpload onUploadComplete={handleUploadComplete} />
        )}
        
        {activeTab === 'website' && (
          <WebsiteImport onImportComplete={handleImportComplete} />
        )}
        
        {activeTab === 'list' && (
          <div className="p-6">
            <DocumentList key={refreshKey} />
          </div>
        )}
      </div>
    </div>
  );
}

export default Documents; 