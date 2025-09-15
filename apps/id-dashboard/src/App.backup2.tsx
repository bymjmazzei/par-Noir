import React, { useState } from 'react';
import { Logo } from './components/Logo';

function App() {
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [pnName, setPnName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Handle form submission
    setTimeout(() => setLoading(false), 2000);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="mb-6">
          <Logo />
        </div>
        <h1 className="text-4xl font-bold text-white mb-2">par NOIR</h1>
        <p className="text-gray-300 text-lg">Through Darkness</p>
      </div>
      
      {/* Main Form */}
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <p className="text-gray-300">Upload your pN file to unlock your pN</p>
        </div>
        
        <form className="space-y-6" onSubmit={handleSubmit}>
          {/* File Upload Area */}
          <div className="relative">
            <input
              type="file"
              accept=".pn,.id,.json,.identity"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setUploadFile(file);
                }
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="flex items-center justify-center w-full px-4 py-8 border-2 border-dashed border-gray-400 rounded-lg cursor-pointer hover:border-gray-300 transition-colors"
            >
              <div className="text-center">
                <div className="text-4xl mb-4 text-gray-400">↑</div>
                <div className="text-gray-300 font-medium">
                  {uploadFile ? uploadFile.name : 'Tap to upload pN file'}
                </div>
                <div className="text-sm text-gray-400 mt-1">
                  (json files recommended)
                </div>
              </div>
            </label>
          </div>
          
          {/* pN Name Input */}
          <div>
            <input
              type="text"
              value={pnName}
              onChange={(e) => setPnName(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your pN Name"
              required
            />
          </div>
          
          {/* Passcode Input */}
          <div>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your passcode"
              required
            />
          </div>
          
          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? 'Unlocking...' : 'Unlock pN'}
          </button>
        </form>
        
        {/* Don't have a pN yet? */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-400 mb-4">Don't have a pN yet?</p>
          <div className="flex gap-3">
            <button
              type="button"
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Create New pN
            </button>
            <button
              type="button"
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Recover pN
            </button>
          </div>
        </div>
        
        {/* Footer Links */}
        <div className="mt-8 text-center">
          <div className="flex justify-center gap-4 text-sm">
            <a href="#" className="text-gray-400 hover:text-gray-300">Terms of Service</a>
            <span className="text-gray-500">•</span>
            <a href="#" className="text-gray-400 hover:text-gray-300">Privacy Policy</a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
