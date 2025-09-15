import React, { useState, useEffect, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { 
  IdentityManager
} from "../../utils/crypto/identityManager";
import { 
  SecureStorage
} from "../../utils/storage";
import { 
  performanceMonitor, 
  measure, 
  measureAsync, 
  recordMetric 
} from "../../utils/performanceMonitor";
import { 
  cryptoWorkerManager 
} from "../../utils/cryptoWorkerManager";
import { 
  optimizedIdentityStorage 
} from "../../utils/optimizedStorage";
import { 
  BiometricAuth 
} from "../../utils/biometric";
import { 
  CloudSyncManager 
} from "../../utils/cloudSync";
import { 
  SecureMetadataStorage 
} from "../../utils/secureMetadataStorage";
import { 
  NotificationsService 
} from "../../utils/notificationsService";
import { 
  IPFSMetadataService 
} from "../../utils/ipfsMetadataService";
import { 
  LicenseVerificationManager 
} from "../../utils/licenseVerification";
import { 
  InputValidator 
} from "../../utils/validation";
import { 
  SecureRandom 
} from "../../utils/secureRandom";
import { 
  MigrationManager 
} from "../../utils/migration";
import { 
  SimpleStorage 
} from "../../utils/simpleStorage";
import { 
  Logger 
} from "../../utils/logger";
import usePWA from "../../hooks/usePWA";
import { 
  AnalyticsManager 
} from "../../utils/analytics";
import { 
  SecurityManager 
} from "../../utils/security";
import { 
  IdentityData 
} from "../../types/crypto";
import { 
  WebIdentityData 
} from "../../types/dashboard";

interface AppMainProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const AppMain: React.FC<AppMainProps> = ({
  isOpen = true,
  onClose = () => {}
}) => {
  const [pwaState, pwaHandlers] = usePWA();
  const [currentView, setCurrentView] = useState<"main" | "qr" | "settings">("main");
  const [identities, setIdentities] = useState<IdentityData[]>([]);
  const [webIdentities, setWebIdentities] = useState<WebIdentityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load identities from storage
      const storageManager = new SecureStorage();
      await storageManager.init(); // Initialize the database
      const identityManager = new IdentityManager();
      
      const storedIdentities = await storageManager.getIdentities();
      const webIdentitiesData = await MigrationManager.getWebIdentities();
      
      setIdentities(storedIdentities);
      setWebIdentities(webIdentitiesData);
      
      // Record metrics
      recordMetric("app_main_data_loaded", {
        identityCount: storedIdentities.length,
        webIdentityCount: webIdentitiesData.length
      });
      
    } catch (error) {
      // Failed to load app data - error handled by UI
      // AppMain loadData error - handled by UI
      setError(`Failed to load application data: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQRCodeScan = useCallback(async (qrData: string) => {
    try {
      const result = await measureAsync("qr_code_scan", async () => {
        // Parse QR code data
        const data = JSON.parse(qrData);
        
        if (data.type === "identity_transfer") {
          // Handle identity transfer
          const migrationManager = new MigrationManager();
          await migrationManager.processTransfer(data);
          
          // Refresh data
          await loadData();
          
          return { success: true, message: "Identity transferred successfully" };
        } else if (data.type === "quick_login") {
          // Handle quick login
          const authResult = await handleQuickLogin(data);
          return authResult;
        }
        
        return { success: false, message: "Unknown QR code type" };
      });
      
      if (result.success) {
        setCurrentView("main");
        // Show success notification
      } else {
        setError(result.message);
      }
      
    } catch (error) {
      // QR code processing failed - error handled by UI
      setError("Failed to process QR code");
    }
  }, [loadData]);

  const handleQuickLogin = useCallback(async (data: any) => {
    try {
      // Validate quick login data
      const validationManager = new InputValidator();
      const isValid = await validationManager.validateQuickLogin(data);
      
      if (!isValid) {
        throw new Error("Invalid quick login data");
      }
      
      // Process quick login
      const authManager = new BiometricAuth();
      const authResult = await authManager.quickLogin(data);
      
      return { success: true, message: "Quick login successful" };
      
    } catch (error) {
      // Quick login failed - return error response
      return { success: false, message: "Quick login failed" };
    }
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const result = await measureAsync("app_export", async () => {
        const storageManager = new SecureStorage();
        const exportData = await storageManager.exportAllData();
        
        // Create and download export file
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
          type: "application/json" 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `par-noir-export-${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        return { success: true };
      });
      
      if (result.success) {
        // Show success message
      }
      
    } catch (error) {
      // Export failed - error handled by UI
      setError("Failed to export data");
    }
  }, []);

  const handlePasscodeLogout = useCallback(async () => {
    try {
      const result = await measureAsync("passcode_logout", async () => {
        // Clear sensitive data
        const storageManager = new SecureStorage();
        await storageManager.clearSensitiveData();
        
        // Reset crypto worker
        await cryptoWorkerManager.restart();
        
        return { success: true };
      });
      
      if (result.success) {
        // Navigate to login
        onClose();
      }
      
    } catch (error) {
      // Passcode logout failed - error handled by UI
      setError("Failed to logout");
    }
  }, [onClose]);

  const handlePinRefresh = useCallback(async () => {
    try {
      const result = await measureAsync("pin_refresh", async () => {
        // Generate new PIN
        const secureRandom = new SecureRandom();
        const newPin = await secureRandom.generateString(6, "0123456789");
        
        // Update PIN in storage
        const storageManager = new SecureStorage();
        await storageManager.updatePin(newPin);
        
        return { success: true, newPin };
      });
      
      if (result.success) {
        // Show new PIN to user
        alert(`Your new PIN is: ${result.newPin}`);
      }
      
    } catch (error) {
      // PIN refresh failed - error handled by UI
      setError("Failed to refresh PIN");
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            par Noir Dashboard
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-500 dark:text-gray-400">Loading...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900 mb-4">
              <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-red-800 dark:text-red-200 mb-2">
              Error Loading Data
            </h3>
            <p className="text-sm text-red-600 dark:text-red-400 mb-4">
              {error}
            </p>
            <button
              onClick={loadData}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Main Dashboard View */}
            {currentView === "main" && (
              <>
                {/* PWA Status */}
                {pwaState.isInstallable && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <span className="text-sm text-blue-800 dark:text-blue-200">
                          Install par Noir as a PWA for a better experience
                        </span>
                      </div>
                      <button
                        onClick={pwaHandlers.install}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        Install
                      </button>
                    </div>
                  </div>
                )}

                {/* Quick Actions */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <button
                    onClick={() => setCurrentView("qr")}
                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                  >
                    <div className="flex items-center space-x-3">
                      <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V6a1 1 0 00-1-1H5a1 1 0 00-1 1v1a1 1 0 001 1zm12 0h2a1 1 0 001-1V6a1 1 0 00-1-1h-2a1 1 0 00-1 1v1a1 1 0 001 1zM5 20h2a1 1 0 001-1v-1a1 1 0 00-1-1H5a1 1 0 00-1 1v1a1 1 0 001 1z" />
                      </svg>
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">Scan QR Code</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Quick login or transfer</p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={handleExport}
                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                  >
                    <div className="flex items-center space-x-3">
                      <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">Export Data</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Backup your data</p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={handlePinRefresh}
                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                  >
                    <div className="flex items-center space-x-3">
                      <svg className="h-6 w-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">Refresh PIN</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Generate new PIN</p>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Identity Summary */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Identity Summary
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Local Identities</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {identities.length}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Web Identities</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {webIdentities.length}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Security Actions */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Security Actions
                  </h3>
                  <div className="flex space-x-3">
                    <button
                      onClick={handlePasscodeLogout}
                      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                    >
                      Passcode Logout
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* QR Code Scanner View */}
            {currentView === "qr" && (
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  QR Code Scanner
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  Point your camera at a QR code to scan
                </p>
                
                {/* Placeholder for QR scanner component */}
                <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-8 mb-6">
                  <svg className="h-16 w-16 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V6a1 1 0 00-1-1H5a1 1 0 00-1 1v1a1 1 0 001 1zm12 0h2a1 1 0 001-1V6a1 1 0 00-1-1h-2a1 1 0 00-1 1v1a1 1 0 001 1zM5 20h2a1 1 0 001-1v-1a1 1 0 00-1-1H5a1 1 0 00-1 1v1a1 1 0 001 1z" />
                  </svg>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    QR Scanner Component
                  </p>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => setCurrentView("main")}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Back to Dashboard
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

AppMain.displayName = "AppMain";
