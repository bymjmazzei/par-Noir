import React, { useState, useCallback, useEffect } from "react";
import { measureAsync } from "../../utils/performanceMonitor";
import { optimizedIdentityStorage } from "../../utils/optimizedStorage";
import { simpleStorage } from "../../utils/simpleStorage";
import { DIDInfo, IdentityData } from "../../types/dashboard";
import { notificationsService } from "../../utils/notificationsService";
import { analytics } from "../../utils/analytics";
import { SecureRandom } from "../../utils/secureRandom";

// Generate random nickname in format "pN123456789"
const generateRandomNickname = (): string => {
  const randomNumbers = SecureRandom.generateStatistic(100000000, 999999999); // 9-digit number
  return `pN${randomNumbers}`;
};

export const useIdentityManagement = (
  setIdentities: React.Dispatch<React.SetStateAction<DIDInfo[]>>,
  setSelectedIdentity: React.Dispatch<React.SetStateAction<DIDInfo | null>>,
  setShowOnboarding: React.Dispatch<React.SetStateAction<boolean>>
) => {
  const handleIdentityCreate = useCallback(async (identityData: IdentityData) => {
    return measureAsync('create_identity', async () => {
      try {
        const newIdentity: DIDInfo = {
          id: `identity_${Date.now()}_${Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(36)).join('').substring(0, 9)}`,
          pnName: identityData.pnName,
          nickname: identityData.nickname || generateRandomNickname(),
          email: identityData.email,
          phone: identityData.phone,
          recoveryEmail: identityData.recoveryEmail,
          recoveryPhone: identityData.recoveryPhone,
          custodiansRequired: identityData.custodiansRequired || false,
          custodiansSetup: false,
          createdAt: new Date().toISOString(),
          status: 'active',
          isEncrypted: true
        };

        // Store in optimized storage
        optimizedIdentityStorage.add(newIdentity);

        // Store in both storages for compatibility
        await SecureStorage.storeIdentity(newIdentity);
        SimpleStorage.storeIdentity(newIdentity);

        setIdentities(prev => [...prev, newIdentity]);
        setSelectedIdentity(newIdentity);
        setShowOnboarding(false);

        // Show success notification
        if (notificationsService) {
          notificationsService.showNotification('Identity created successfully!', 'success');
        }

        // Analytics
        if (analytics) {
          analytics.track('identity_created', {
            identityId: newIdentity.id,
            hasEmail: !!newIdentity.email,
            hasPhone: !!newIdentity.phone,
            custodiansRequired: newIdentity.custodiansRequired
          });
        }

        return newIdentity;
      } catch (error) {
        // Console statement removed for production
        if (notificationsService) {
          notificationsService.showNotification('Failed to create identity', 'error');
        }
        throw error;
      }
    });
  }, [setIdentities, setSelectedIdentity, setShowOnboarding]);

  const handleIdentityUpdate = useCallback(async (id: string, updates: Partial<DIDInfo>) => {
    return measureAsync('update_identity', async () => {
      try {
        // Update in optimized storage
        optimizedIdentityStorage.update(id, updates);

        // Update in both storages for compatibility
        await SecureStorage.updateIdentity(id, updates);
        SimpleStorage.updateIdentity(id, updates);

        setIdentities(prev => prev.map(identity => 
          identity.id === id ? { ...identity, ...updates } : identity
        ));

        return true;
      } catch (error) {
        // Console statement removed for production
        throw error;
      }
    });
  }, [setIdentities]);

  const handleIdentityDelete = useCallback(async (id: string) => {
    return measureAsync('delete_identity', async () => {
      try {
        // Delete from optimized storage
        optimizedIdentityStorage.delete(id);

        // Delete from both storages for compatibility
        await SecureStorage.deleteIdentity(id);
        SimpleStorage.deleteIdentity(id);

        setIdentities(prev => prev.filter(identity => identity.id !== id));
        
        return true;
      } catch (error) {
        // Console statement removed for production
        throw error;
      }
    });
  }, [setIdentities]);

  return {
    handleIdentityCreate,
    handleIdentityUpdate,
    handleIdentityDelete,
    generateRandomNickname,
  };
};

// IdentityManagement Component
interface IdentityManagementProps {
  onIdentitySelect: (identity: DIDInfo) => void;
  onIdentityCreate: (identity: DIDInfo) => void;
  onIdentityUpdate: (identity: DIDInfo) => void;
  onIdentityDelete: (identityId: string) => void;
}

export const IdentityManagement: React.FC<IdentityManagementProps> = ({
  onIdentitySelect,
  onIdentityCreate,
  onIdentityUpdate,
  onIdentityDelete
}) => {
  const [identities, setIdentities] = useState<DIDInfo[]>([]);
  const [selectedIdentity, setSelectedIdentity] = useState<DIDInfo | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const {
    handleIdentityCreate,
    handleIdentityUpdate,
    handleIdentityDelete,
    generateRandomNickname
  } = useIdentityManagement(setIdentities, setSelectedIdentity, setShowOnboarding);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Your Identities</h2>
      <div className="space-y-2">
        {identities.map((identity) => (
          <button
            key={identity.id}
            onClick={() => {
              setSelectedIdentity(identity);
              onIdentitySelect(identity);
            }}
            className={`w-full text-left p-3 rounded-md transition-colors ${
              selectedIdentity?.id === identity.id
                ? 'bg-blue-100 border border-blue-300'
                : 'hover:bg-gray-50'
            }`}
          >
            <div className="font-medium">{identity.pnName || identity.displayName}</div>
            <div className="text-sm text-gray-500">{identity.id}</div>
          </button>
        ))}
        {identities.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No identities found</p>
            <button
              onClick={() => onIdentityCreate({} as DIDInfo)}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create Your First Identity
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
