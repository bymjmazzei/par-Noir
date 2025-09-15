import React, { useState } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { SecureFileHandler } from '../utils/SecureFileHandler';

interface IDUploadStepProps {
  onUpload: (file: File) => void;
}

export const IDUploadStep: React.FC<IDUploadStepProps> = ({ onUpload }) => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (file: File) => {
    setError(null);
    
    // Use secure file validation
    const validation = SecureFileHandler.validateFile(file);
    if (!validation.isValid) {
      setError(validation.error || 'Invalid file');
      return;
    }
    
    setUploadedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className="upload-step">
      <div className="step-header">
        <h4>Upload Government ID</h4>
        <p>Upload a clear photo of your driver's license, passport, or state ID</p>
      </div>
      
      <div className="upload-requirements">
        <h5>Requirements:</h5>
        <ul>
          <li>Clear, readable image or PDF</li>
          <li>All text must be visible</li>
          <li>File size under 10MB</li>
          <li>Accepted formats: JPEG, PNG, PDF</li>
        </ul>
      </div>
      
      <div 
        className={`upload-zone ${dragActive ? 'drag-active' : ''} ${error ? 'error' : ''}`}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {uploadedFile ? (
          <div className="file-selected">
            <div className="file-info">
              <FileText className="w-8 h-8 text-green-600" />
              <div>
                <h4>File Selected</h4>
                <p className="file-name">{uploadedFile.name}</p>
                <p className="file-size">{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
            
            <button 
              onClick={() => onUpload(uploadedFile)}
              className="btn-primary"
            >
              CONTINUE TO SELFIE
            </button>
          </div>
        ) : (
          <div className="upload-prompt">
            <input
              type="file"
              accept="image/jpeg,image/png,image/jpg,application/pdf"
              onChange={handleFileInputChange}
              id="id-upload"
              style={{ display: 'none' }}
            />
            
            <div className="upload-icon">
              <Upload className="w-12 h-12 text-gray-400" />
            </div>
            
            <h4>Drop your ID here or click to browse</h4>
            <p>Drag and drop your government ID, or click to select a file</p>
            
            <label htmlFor="id-upload" className="upload-button">
              📷 SELECT ID PHOTO
            </label>
            
            <p className="upload-hint">JPEG, PNG, or PDF • Max 10MB</p>
          </div>
        )}
      </div>
      
      {error && (
        <div className="error-message">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}
      
      <div className="pricing-info">
        <h4>Verification Cost</h4>
        <p className="price">$5.00</p>
        <p className="description">One-time fee for identity verification</p>
      </div>
    </div>
  );
};
