// Demo File Manager
// Handles demo files and generates thumbnails

export interface DemoFileConfig {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  createdTime: string;
  modifiedTime: string;
  description: string;
  thumbnail?: string; // Base64 thumbnail or URL
  filePath?: string; // Path to actual file
}

export class DemoFileManager {
  private static instance: DemoFileManager;
  private demoFiles: DemoFileConfig[] = [];

  static getInstance(): DemoFileManager {
    if (!DemoFileManager.instance) {
      DemoFileManager.instance = new DemoFileManager();
    }
    return DemoFileManager.instance;
  }

  // Generate thumbnail for different file types
  generateThumbnail(file: DemoFileConfig): string {
    if (file.thumbnail) {
      return file.thumbnail;
    }

    // Generate thumbnail based on file type
    if (file.mimeType.includes('image')) {
      return this.generateImageThumbnail(file);
    } else if (file.mimeType.includes('video')) {
      return this.generateVideoThumbnail(file);
    } else if (file.mimeType.includes('audio')) {
      return this.generateAudioThumbnail(file);
    } else if (file.mimeType.includes('pdf')) {
      return this.generatePDFThumbnail(file);
    } else if (file.mimeType.includes('text') || file.mimeType.includes('markdown')) {
      return this.generateTextThumbnail(file);
    } else if (file.mimeType.includes('json')) {
      return this.generateJSONThumbnail(file);
    } else if (file.mimeType.includes('html')) {
      return this.generateHTMLThumbnail(file);
    } else {
      return this.generateGenericThumbnail(file);
    }
  }

  private generateImageThumbnail(file: DemoFileConfig): string {
    // For images, we'll create a placeholder that can be replaced with actual image
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="150" fill="#f3f4f6"/>
        <rect x="20" y="20" width="160" height="110" fill="#e5e7eb" stroke="#d1d5db" stroke-width="2"/>
        <text x="100" y="80" text-anchor="middle" font-family="Arial" font-size="14" fill="#6b7280">
          ${file.name}
        </text>
        <text x="100" y="100" text-anchor="middle" font-family="Arial" font-size="10" fill="#9ca3af">
          Image Preview
        </text>
        <circle cx="100" cy="120" r="15" fill="#4f46e5"/>
        <text x="100" y="125" text-anchor="middle" font-family="Arial" font-size="12" fill="white">🔒</text>
      </svg>
    `)}`;
  }

  private generateVideoThumbnail(file: DemoFileConfig): string {
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="150" fill="#1f2937"/>
        <rect x="20" y="20" width="160" height="110" fill="#374151" stroke="#4b5563" stroke-width="2"/>
        <polygon points="80,60 80,90 110,75" fill="#ffffff"/>
        <text x="100" y="110" text-anchor="middle" font-family="Arial" font-size="12" fill="#d1d5db">
          ${file.name}
        </text>
        <circle cx="100" cy="130" r="12" fill="#4f46e5"/>
        <text x="100" y="135" text-anchor="middle" font-family="Arial" font-size="10" fill="white">🔒</text>
      </svg>
    `)}`;
  }

  private generateAudioThumbnail(file: DemoFileConfig): string {
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="150" fill="#fef3c7"/>
        <rect x="20" y="20" width="160" height="110" fill="#fbbf24" stroke="#f59e0b" stroke-width="2"/>
        <circle cx="70" cy="60" r="20" fill="#ffffff"/>
        <circle cx="130" cy="60" r="20" fill="#ffffff"/>
        <path d="M 70 40 L 70 80 M 130 40 L 130 80" stroke="#6b7280" stroke-width="3"/>
        <text x="100" y="110" text-anchor="middle" font-family="Arial" font-size="12" fill="#92400e">
          ${file.name}
        </text>
        <circle cx="100" cy="130" r="12" fill="#4f46e5"/>
        <text x="100" y="135" text-anchor="middle" font-family="Arial" font-size="10" fill="white">🔒</text>
      </svg>
    `)}`;
  }

  private generatePDFThumbnail(file: DemoFileConfig): string {
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="150" fill="#fef2f2"/>
        <rect x="20" y="20" width="160" height="110" fill="#ffffff" stroke="#f87171" stroke-width="2"/>
        <rect x="30" y="30" width="140" height="20" fill="#fca5a5"/>
        <rect x="30" y="55" width="140" height="5" fill="#fecaca"/>
        <rect x="30" y="65" width="100" height="5" fill="#fecaca"/>
        <rect x="30" y="75" width="120" height="5" fill="#fecaca"/>
        <rect x="30" y="85" width="80" height="5" fill="#fecaca"/>
        <text x="100" y="110" text-anchor="middle" font-family="Arial" font-size="12" fill="#dc2626">
          ${file.name}
        </text>
        <circle cx="100" cy="130" r="12" fill="#4f46e5"/>
        <text x="100" y="135" text-anchor="middle" font-family="Arial" font-size="10" fill="white">🔒</text>
      </svg>
    `)}`;
  }

  private generateTextThumbnail(file: DemoFileConfig): string {
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="150" fill="#f0f9ff"/>
        <rect x="20" y="20" width="160" height="110" fill="#ffffff" stroke="#0ea5e9" stroke-width="2"/>
        <rect x="30" y="30" width="140" height="3" fill="#0ea5e9"/>
        <rect x="30" y="40" width="120" height="3" fill="#0ea5e9"/>
        <rect x="30" y="50" width="100" height="3" fill="#0ea5e9"/>
        <rect x="30" y="60" width="110" height="3" fill="#0ea5e9"/>
        <rect x="30" y="70" width="90" height="3" fill="#0ea5e9"/>
        <text x="100" y="110" text-anchor="middle" font-family="Arial" font-size="12" fill="#0369a1">
          ${file.name}
        </text>
        <circle cx="100" cy="130" r="12" fill="#4f46e5"/>
        <text x="100" y="135" text-anchor="middle" font-family="Arial" font-size="10" fill="white">🔒</text>
      </svg>
    `)}`;
  }

  private generateJSONThumbnail(file: DemoFileConfig): string {
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="150" fill="#f0fdf4"/>
        <rect x="20" y="20" width="160" height="110" fill="#ffffff" stroke="#22c55e" stroke-width="2"/>
        <text x="30" y="40" font-family="monospace" font-size="10" fill="#16a34a">{</text>
        <text x="40" y="55" font-family="monospace" font-size="10" fill="#16a34a">"key": "value"</text>
        <text x="40" y="70" font-family="monospace" font-size="10" fill="#16a34a">"data": [...]</text>
        <text x="30" y="85" font-family="monospace" font-size="10" fill="#16a34a">}</text>
        <text x="100" y="110" text-anchor="middle" font-family="Arial" font-size="12" fill="#15803d">
          ${file.name}
        </text>
        <circle cx="100" cy="130" r="12" fill="#4f46e5"/>
        <text x="100" y="135" text-anchor="middle" font-family="Arial" font-size="10" fill="white">🔒</text>
      </svg>
    `)}`;
  }

  private generateHTMLThumbnail(file: DemoFileConfig): string {
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="150" fill="#fef7ff"/>
        <rect x="20" y="20" width="160" height="110" fill="#ffffff" stroke="#a855f7" stroke-width="2"/>
        <text x="30" y="40" font-family="monospace" font-size="10" fill="#9333ea">&lt;html&gt;</text>
        <text x="30" y="55" font-family="monospace" font-size="10" fill="#9333ea">&lt;head&gt;</text>
        <text x="30" y="70" font-family="monospace" font-size="10" fill="#9333ea">&lt;body&gt;</text>
        <text x="30" y="85" font-family="monospace" font-size="10" fill="#9333ea">content</text>
        <text x="100" y="110" text-anchor="middle" font-family="Arial" font-size="12" fill="#7c3aed">
          ${file.name}
        </text>
        <circle cx="100" cy="130" r="12" fill="#4f46e5"/>
        <text x="100" y="135" text-anchor="middle" font-family="Arial" font-size="10" fill="white">🔒</text>
      </svg>
    `)}`;
  }

  private generateGenericThumbnail(file: DemoFileConfig): string {
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="150" fill="#f9fafb"/>
        <rect x="20" y="20" width="160" height="110" fill="#ffffff" stroke="#6b7280" stroke-width="2"/>
        <rect x="70" y="50" width="60" height="40" fill="#e5e7eb" stroke="#9ca3af" stroke-width="2"/>
        <text x="100" y="110" text-anchor="middle" font-family="Arial" font-size="12" fill="#374151">
          ${file.name}
        </text>
        <circle cx="100" cy="130" r="12" fill="#4f46e5"/>
        <text x="100" y="135" text-anchor="middle" font-family="Arial" font-size="10" fill="white">🔒</text>
      </svg>
    `)}`;
  }

  // Add a demo file
  addDemoFile(file: DemoFileConfig): void {
    this.demoFiles.push(file);
  }

  // Get all demo files
  getDemoFiles(): DemoFileConfig[] {
    return this.demoFiles;
  }

  // Get demo file by ID
  getDemoFile(id: string): DemoFileConfig | undefined {
    return this.demoFiles.find(file => file.id === id);
  }

  // Clear all demo files
  clearDemoFiles(): void {
    this.demoFiles = [];
  }
}
