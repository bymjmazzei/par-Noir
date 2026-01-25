# Testing Connection Requests - Debugging Guide

## Current Issue: "Invalid Credentials" Error

The error `Failed to send connection request: Invalid Credentials` typically occurs when:
1. Google OAuth refresh token is invalid/expired
2. Account ID mismatch between stored credentials and what's being requested
3. Corrupted credentials in storage

## Best Way to Test

### Option 1: Fresh Test (Recommended)
1. **Disconnect Google Drive for both users** in the dashboard
2. **Reconnect Google Drive** for both users (this refreshes all tokens)
3. **Try connecting** the two pNs again

This ensures all credentials are fresh and valid.

### Option 2: Check Server Logs
The improved error logging will now show:
- Which user (requester/recipient) failed
- The identityId and accountId being used
- Whether credentials exist and their structure

**Check Railway logs** (or your deployment logs) for:
```
[ConnectionRequest] Failed to get requester/recipient access token
[ConnectionRequest] Requester/Recipient details: {...}
```

### Option 3: Verify Credentials Structure
The error might be caused by:
- `accountId` not matching what's stored in `googleDriveAccounts`
- Missing `refresh_token` in stored credentials
- Expired refresh token that needs re-authentication

## What the Fixes Do

### Root Cause Fixes (Already Implemented)
1. **Sheets Services**: Validate all rows, skip invalid entries, ensure `userPnIdentifier` is NEVER undefined
2. **API Endpoints**: Filter invalid connections/conversations before returning
3. **Browser Code**: Use correct field names (`userPnIdentifier` instead of `userDid`)

### New Error Logging (Just Added)
- Catches `getAccessToken` errors separately for requester vs recipient
- Logs detailed credential information
- Returns more descriptive error messages

## Testing Steps

1. **Check if error persists with fresh credentials:**
   ```bash
   # In dashboard, disconnect and reconnect Google Drive for both users
   # Then try connection request again
   ```

2. **Check server logs for detailed error:**
   - Look for `[ConnectionRequest] Failed to get requester/recipient access token`
   - Check the logged details to see what's wrong

3. **If error persists, check:**
   - Are both users' Google Drive accounts properly connected?
   - Do the credentials have valid `refresh_token` values?
   - Is the `accountId` matching what's stored?

## Expected Behavior After Fixes

- Connection requests should work if credentials are valid
- If credentials are invalid, you'll get a clear error message indicating which user has the problem
- Server logs will show exactly what went wrong

## Next Steps if Error Persists

1. Check Railway/server logs for the detailed error output
2. Verify both users have valid Google Drive connections
3. If refresh tokens are expired, users need to reconnect in dashboard
4. Share the server log output for further diagnosis
