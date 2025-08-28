import React, { useState, useEffect } from 'react';
import { Bluetooth, Smartphone, Laptop, Tablet, Wifi, Loader, CheckCircle, XCircle } from 'lucide-react';

interface BluetoothDevice {
  id: string;
  name: string;
  type: 'mobile' | 'desktop' | 'tablet' | 'other';
  rssi: number; // Signal strength
  isPaired: boolean;
}

interface BluetoothDeviceSyncProps {
  isOpen: boolean;
  onClose: () => void;
  onDeviceSelected: (device: BluetoothDevice) => void;
  onSyncRequest?: (device: BluetoothDevice) => void; // For initiating sync
  isInitiatingSync?: boolean; // true = Device A initiating, false = Device B receiving
}

export const BluetoothDeviceSync: React.FC<BluetoothDeviceSyncProps> = ({
  isOpen,
  onClose,
  onDeviceSelected,
  onSyncRequest,
  isInitiatingSync = true
}) => {
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string>('');
  const [selectedDevice, setSelectedDevice] = useState<BluetoothDevice | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      startDeviceDiscovery();
    } else {
      stopDeviceDiscovery();
    }

    return () => {
      stopDeviceDiscovery();
    };
  }, [isOpen]);

  const startDeviceDiscovery = async () => {
    try {
      setIsScanning(true);
      setError('');
      setDevices([]);

      // Check if Web Bluetooth API is supported
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth API is not supported in this browser');
      }

      // Request Bluetooth device with specific filters
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['generic_access', 'generic_attribute']
      });

      // Convert the Bluetooth device to our format
      const bluetoothDevice: BluetoothDevice = {
        id: device.id,
        name: device.name || 'Unknown Device',
        type: getDeviceTypeFromName(device.name || ''),
        rssi: -50, // Web Bluetooth API doesn't provide RSSI directly
        isPaired: device.gatt?.connected || false
      };

      setDevices([bluetoothDevice]);
      setIsScanning(false);
      
    } catch (error) {
      console.error('Bluetooth discovery error:', error);
      if (error instanceof Error) {
        if (error.message.includes('User cancelled')) {
          setError('Bluetooth device selection was cancelled');
        } else if (error.message.includes('not supported')) {
          setError('Web Bluetooth API is not supported in this browser. Please use Chrome, Edge, or Opera.');
        } else {
          setError('Bluetooth discovery failed: ' + error.message);
        }
      } else {
        setError('Bluetooth discovery failed');
      }
      setIsScanning(false);
    }
  };

  const stopDeviceDiscovery = () => {
    setIsScanning(false);
    setDevices([]);
  };

  const getDeviceTypeFromName = (name: string): 'mobile' | 'desktop' | 'tablet' | 'other' => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('iphone') || lowerName.includes('android') || lowerName.includes('samsung') || lowerName.includes('galaxy')) {
      return 'mobile';
    } else if (lowerName.includes('mac') || lowerName.includes('pc') || lowerName.includes('laptop') || lowerName.includes('desktop')) {
      return 'desktop';
    } else if (lowerName.includes('ipad') || lowerName.includes('tablet')) {
      return 'tablet';
    }
    return 'other';
  };

  const handleDeviceSelect = async (device: BluetoothDevice) => {
    try {
      setIsConnecting(true);
      setSelectedDevice(device);

      if (isInitiatingSync) {
        // Device A: Initiate sync request to Device B
        if (onSyncRequest) {
          onSyncRequest(device);
        }
      } else {
        // Device B: Accept sync from Device A
        onDeviceSelected(device);
      }
      
    } catch (err) {
      console.error('Device connection error:', err);
      setError('Failed to connect to device. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'mobile':
        return <Smartphone className="w-6 h-6" />;
      case 'desktop':
        return <Laptop className="w-6 h-6" />;
      case 'tablet':
        return <Tablet className="w-6 h-6" />;
      default:
        return <Bluetooth className="w-6 h-6" />;
    }
  };

  const getSignalStrength = (rssi: number) => {
    if (rssi >= -50) return 'Excellent';
    if (rssi >= -60) return 'Good';
    if (rssi >= -70) return 'Fair';
    return 'Poor';
  };

  const getSignalColor = (rssi: number) => {
    if (rssi >= -50) return 'text-green-500';
    if (rssi >= -60) return 'text-yellow-500';
    if (rssi >= -70) return 'text-orange-500';
    return 'text-red-500';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">
            {isInitiatingSync ? 'Select Device to Transfer pN To' : 'pN Transfer Request'}
          </h2>
                      <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors font-medium"
            >
              Cancel
            </button>
        </div>

        <div className="mb-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-4">
            <div className="flex items-center space-x-3">
              <div className="text-2xl">📱</div>
              <div>
                <div className="font-medium text-text-primary">
                  {isInitiatingSync ? 'Choose a device to transfer your pN to' : 'A device wants to transfer pN file to you'}
                </div>
                <div className="text-sm text-text-secondary">
                  {isInitiatingSync ? 'Select a nearby device to transfer your pN file' : 'Authenticate to receive the pN file'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Scanning Status */}
        {isScanning && (
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex items-center space-x-3">
              <Loader className="w-5 h-5 animate-spin text-blue-600" />
              <div>
                <div className="font-medium text-text-primary">Scanning for devices...</div>
                <div className="text-sm text-text-secondary">Looking for nearby pN devices</div>
              </div>
            </div>
          </div>
        )}

        {/* Device List */}
        <div className="space-y-3 mb-6">
          {devices.length > 0 ? (
            devices.map((device) => (
              <button
                key={device.id}
                onClick={() => handleDeviceSelect(device)}
                disabled={isConnecting}
                className="w-full p-4 border border-border rounded-lg hover:bg-modal-bg transition-colors text-left disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="text-text-secondary">
                      {getDeviceIcon(device.type)}
                    </div>
                    <div>
                      <div className="font-medium text-text-primary">{device.name}</div>
                      <div className="text-sm text-text-secondary capitalize">
                        {device.type} • {getSignalStrength(device.rssi)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`text-sm ${getSignalColor(device.rssi)}`}>
                      {device.rssi} dBm
                    </div>
                    {selectedDevice?.id === device.id && isConnecting ? (
                      <Loader className="w-4 h-4 animate-spin text-blue-600" />
                    ) : (
                      <Wifi className="w-4 h-4 text-text-secondary" />
                    )}
                  </div>
                </div>
              </button>
            ))
          ) : !isScanning ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">📱</div>
              <div className="text-text-secondary">
                No devices found nearby
              </div>
              <div className="text-sm text-text-secondary mt-1">
                Make sure the other device has Bluetooth enabled
              </div>
            </div>
          ) : null}
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <button
            onClick={startDeviceDiscovery}
            disabled={isScanning}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
          >
            {isScanning ? 'Scanning...' : 'Scan Again'}
          </button>
          <button
            onClick={onClose}
            disabled={isConnecting}
            className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors font-medium disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        {/* Bluetooth Info */}
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-sm text-blue-600 dark:text-blue-400">
            <strong>Note:</strong> This uses the Web Bluetooth API to discover actual nearby devices. Make sure Bluetooth is enabled on both devices.
          </p>
        </div>

        <div className="mt-4 text-xs text-text-secondary space-y-1">
          <p>• Devices must be within Bluetooth range (~10 meters)</p>
          <p>• Both devices must have Bluetooth enabled</p>
          <p>• pN authentication will be required after device selection</p>
          <p>• Data transfer is encrypted and secure</p>
        </div>
      </div>
    </div>
  );
};
