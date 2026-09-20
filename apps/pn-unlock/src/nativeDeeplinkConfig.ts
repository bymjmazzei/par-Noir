/**
 * Native deep-link / Associated Domains / App Links notes for com.parnoir.unlock.
 *
 * After `npx cap add android` / `npx cap add ios` (or build:mobile):
 *
 * Android — add to AndroidManifest.xml activity:
 *
 *   <intent-filter android:autoVerify="true">
 *     <action android:name="android.intent.action.VIEW" />
 *     <category android:name="android.intent.category.DEFAULT" />
 *     <category android:name="android.intent.category.BROWSABLE" />
 *     <data android:scheme="https" android:host="unlock.parnoir.com" android:pathPrefix="/oauth" />
 *   </intent-filter>
 *   <intent-filter>
 *     <action android:name="android.intent.action.VIEW" />
 *     <category android:name="android.intent.category.DEFAULT" />
 *     <category android:name="android.intent.category.BROWSABLE" />
 *     <data android:scheme="com.parnoir.unlock" android:host="oauth" />
 *   </intent-filter>
 *
 * Also USE_BIOMETRIC permission.
 *
 * iOS — Info.plist CFBundleURLTypes scheme com.parnoir.unlock;
 * entitlements Associated Domains: applinks:unlock.parnoir.com
 * NSFaceIDUsageDescription for session vault.
 *
 * Hosted association files: public/.well-known/* (see STORE_ASSOCIATION_CHECKLIST.md).
 */

export const UNLOCK_DEEPLINK_HOST = 'unlock.parnoir.com';
export const UNLOCK_DEEPLINK_PATH_PREFIX = '/oauth';
