// Detection Constants - Thresholds for commercial usage detection
export const DETECTION_THRESHOLDS = {
  API_CALL_FREQUENCY_THRESHOLD: 100, // calls per hour
  // Removed USER_COUNT_THRESHOLD - basic auth is unlimited
  SCALE_THRESHOLDS: {
    // Removed USER_COUNT_THRESHOLD - basic auth is unlimited
    INTEGRATION_COUNT_THRESHOLD: 5, // integrations
    BULK_OPERATION_THRESHOLD: 1000 // records per operation
  },
  GRACE_PERIOD_DAYS: 30
};
