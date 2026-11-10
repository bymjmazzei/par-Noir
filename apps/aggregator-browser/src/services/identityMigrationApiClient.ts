import { apiFetch } from './ownerApiFetch';

/** Step ack — Bearer session only; the cloud writes for each step ran on the device. */
export async function ackMigrationStep(
  authToken: string,
  migrationId: string,
  stepId: string
): Promise<void> {
  await apiFetch(
    'PATCH',
    `/api/identity/migration/${encodeURIComponent(migrationId)}/steps/${encodeURIComponent(stepId)}`,
    {},
    { authToken }
  );
}
