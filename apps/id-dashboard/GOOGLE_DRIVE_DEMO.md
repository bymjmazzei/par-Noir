# Google Drive Integration Demo

This document explains how to use the demoable Google Drive integration for recording demo videos to send to Google for API approval.

## Overview

The Google Drive integration has been enhanced with a comprehensive demo mode that simulates all the functionality without requiring actual API access. This allows you to record a complete demonstration video showing how the integration would work.

## Features Demonstrated

### 🔐 Authentication Flow
- OAuth 2.0 authentication simulation
- User profile access (demo user: demo@parnoir.com)
- Token management and session handling

### 📁 File Management
- **List Files**: Browse demo files including identity documents, certificates, and recovery codes
- **Upload Files**: Simulated file upload with progress tracking
- **Download Files**: Demo file downloads with realistic file content
- **Delete Files**: File deletion with confirmation

### 📊 Demo Data
The demo includes realistic sample files:
- Identity Verification Document.pdf
- Digital Certificate.crt
- Backup Keys.txt
- par Noir Documents (folder)
- Account Recovery Codes.csv

### ⚡ Real-time Features
- Progress indicators for uploads
- Loading states and animations
- Error handling simulation
- File statistics and metadata

## How to Access Demo Mode

### Option 1: Through the Dashboard
1. Open the par Noir dashboard
2. Navigate to the **Storage** tab
3. Click the **"Demo Mode"** button in the top-right corner
4. The interface will switch to full demo mode with recording controls

### Option 2: Direct Demo Component
The `GoogleDriveDemo` component provides a complete demo environment with:
- Recording controls (Start/Stop recording)
- View mode toggle (Desktop/Mobile)
- Demo reset functionality
- Technical implementation details

## Demo Mode Controls

### Recording Controls
- **Start Recording**: Initiates demo recording mode
- **Stop Recording**: Ends recording session
- **Reset Demo**: Resets all demo data to initial state

### View Modes
- **Desktop View**: Full desktop interface
- **Mobile View**: Mobile-optimized layout for responsive demo

### Demo Settings
- **Enable Demo Mode**: Toggle between demo and real API mode
- **Reset Demo Data**: Restore original demo files
- **Demo Statistics**: View file counts and storage metrics

## Recording Your Demo Video

### Recommended Demo Flow
1. **Start Recording** and introduce the par Noir platform
2. Navigate to **Storage** tab and click **"Demo Mode"**
3. Click **"Start Demo Connection"** to simulate authentication
4. Browse through the demo files, explaining each type
5. Upload a new file to demonstrate the upload process
6. Download a file to show the download functionality
7. Delete a file to demonstrate file management
8. Use the demo controls to reset and show different scenarios
9. **Stop Recording** when complete

### Key Points to Highlight
- **Security**: Emphasize OAuth 2.0 authentication and secure token handling
- **User Experience**: Show the intuitive interface and smooth interactions
- **File Types**: Highlight support for various file types (PDFs, certificates, etc.)
- **Real-time Updates**: Demonstrate progress indicators and live updates
- **Error Handling**: Show how the system gracefully handles errors

## Technical Implementation

### Demo Service Architecture
- `GoogleDriveDemoService`: Mock service that simulates all API calls
- Realistic delays and progress simulation
- Comprehensive error handling
- State management for authentication and file operations

### Integration Points
- Seamless switching between demo and real API modes
- Consistent UI/UX across both modes
- Production-ready code structure

## Files Modified/Created

### New Files
- `src/services/googleDriveDemoService.ts` - Mock Google Drive service
- `src/components/storage/GoogleDriveDemo.tsx` - Demo component with recording controls
- `GOOGLE_DRIVE_DEMO.md` - This documentation

### Modified Files
- `src/components/storage/GoogleDriveStorage.tsx` - Added demo mode support
- `src/App.tsx` - Added demo mode toggle and routing

## For Google API Approval

When submitting to Google for API access approval, emphasize:

1. **Use Case**: Identity management and secure document storage
2. **Security**: OAuth 2.0 implementation with limited scope (`drive.file`)
3. **User Experience**: Intuitive file management interface
4. **Data Privacy**: Files stored in app-specific folder (`appDataFolder`)
5. **Error Handling**: Comprehensive error management and user feedback

## Demo Mode Benefits

- **No API Keys Required**: Demo works without Google API credentials
- **Realistic Experience**: Simulates real API behavior with delays and progress
- **Complete Functionality**: All features demonstrated without limitations
- **Professional Presentation**: Clean, polished interface for video recording
- **Easy Reset**: Quick demo data reset for multiple recording attempts

## Support

For questions about the demo mode or Google Drive integration, refer to the technical documentation in the codebase or contact the development team.

---

**Note**: This demo mode is designed specifically for demonstration purposes and should not be used in production. The real Google Drive integration will use actual API calls once approved by Google.
