import React, { useState } from 'react';

function WebsiteImport({ onImportComplete }) {
  const [url, setUrl] = useState('');
  const [depth, setDepth] = useState(1);
  const [maxLinks, setMaxLinks] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/collector/process-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          link: url,
          options: {
            depth,
            maxLinks
          }
        })
      });

      const result = await response.json();

      if (result.success) {
        if (onImportComplete) {
          onImportComplete(result);
        }
        setUrl('');
      } else {
        setError(result.reason || 'Failed to import website');
      }
    } catch (err) {
      console.error('Website import error:', err);
      setError('Failed to import website');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label 
            htmlFor="url" 
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Website URL
          </label>
          <input
            type="url"
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label 
              htmlFor="depth" 
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Crawl Depth
            </label>
            <input
              type="number"
              id="depth"
              value={depth}
              onChange={(e) => setDepth(parseInt(e.target.value))}
              min="1"
              max="5"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label 
              htmlFor="maxLinks" 
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Max Links
            </label>
            <input
              type="number"
              id="maxLinks"
              value={maxLinks}
              onChange={(e) => setMaxLinks(parseInt(e.target.value))}
              min="1"
              max="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {error && (
          <div className="text-red-600 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
            ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {loading ? 'Importing...' : 'Import Website'}
        </button>
      </form>
    </div>
  );
}

export default WebsiteImport; 