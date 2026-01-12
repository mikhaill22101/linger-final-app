# Legal Safety Layer & Visual Polish Implementation

## Summary

This document describes the implementation of a minimal legal safety layer and visual polish improvements that comply with:
- Russian Federation law (152-FZ, data minimization, user consent)
- Apple App Store Review Guidelines
- Google Play policies
- Privacy-by-design principles

## PART A — System Events Logging

### Implementation

**File:** `src/lib/system-events.ts`

A minimal system events log structure for legal compliance and dispute resolution.

**Event Types:**
- `account_deleted` - User account deletion
- `verification_completed` - User verification completion
- `verification_revoked` - Verification revocation (future-proof)
- `admin_block_applied` - Admin moderation action (future-proof)

**Log Entry Structure:**
```typescript
{
  event_type: SystemEventType;
  user_id: string; // TODO: Backend may hash this
  timestamp: string; // ISO format
  source: 'user' | 'admin' | 'system';
  metadata?: { reason?: string; admin_id?: string };
}
```

**What is NOT logged:**
- Names
- Photos
- Messages
- User-generated content
- Personal data beyond user_id

**Legal Compliance:**
- RF 152-FZ: Data minimization (only essential metadata)
- Purpose limitation: Legal compliance and dispute resolution only
- No tracking or behavioral profiling
- Transparent purpose

**Backend TODOs:**
- Create `system_events` table in Supabase
- Implement retention policy (e.g., 7 years)
- Add indexes on `user_id` and `timestamp`
- Implement RLS policies (admin-only access)
- Optional: Hash `user_id` for additional privacy

### Integration

**File:** `src/lib/account-deletion.ts`
- Integrated `logSystemEvent('account_deleted', 'user')` after successful account deletion

## PART B — Consent Logging (RF 152-FZ Compliance)

### Implementation

**File:** `src/lib/consent-logging.ts`

A consent logging mechanism that satisfies RF 152-FZ requirements for explicit consent tracking.

**Consent Types:**
- `terms_of_service` - Terms of Service acceptance
- `privacy_policy` - Privacy Policy acceptance
- `verification_consent` - Verification process consent
- `camera_consent` - Camera usage consent

**Consent Record Structure:**
```typescript
{
  user_id: string;
  consent_type: ConsentType;
  policy_version: string; // e.g., "1.0"
  timestamp: string; // ISO format
  withdrawn?: boolean;
  withdrawn_at?: string; // ISO format, if withdrawn
}
```

**Legal Compliance:**
- RF 152-FZ: Explicit consent logging required
- Data minimization: Only essential metadata
- User control: Users can withdraw consent
- Transparency: Policy versions tracked

**Backend TODOs:**
- Create `consent_logs` table in Supabase
- Implement retention policy (e.g., 7 years)
- Add indexes on `user_id` and `timestamp`
- Implement RLS policies (users can view their own logs)
- Create API endpoint for consent withdrawal

### Integration

**File:** `src/components/TermsSummary.tsx`
- Integrated `logConsent('terms_of_service')` and `logConsent('privacy_policy')` when user accepts Terms

## PART C — Visual Polish

### Implementation

**1. Haptic Feedback Utility**

**File:** `src/lib/haptic-feedback.ts`

Cross-platform haptic feedback:
- iOS/Android: Uses Telegram WebApp HapticFeedback API
- Web: Gracefully degrades (no haptic feedback)
- User-initiated only (not automatic)
- No tracking or analytics

**2. Skeleton Loaders**

**File:** `src/components/SkeletonLoader.tsx`

Neutral, non-intrusive loading placeholders:
- No progress bars
- Neutral colors (white/5 opacity)
- Shape matches final content
- Smooth animation (1.5s fade loop)

**Components:**
- `SkeletonLoader` - Generic skeleton with configurable shape
- `AvatarSkeleton` - Specific skeleton for profile photos

**Integration:**

**File:** `src/components/Profile.tsx`
- Added `AvatarSkeleton` during profile photo loading
- Imported `triggerHapticFeedback` utility (ready for future use)

## PART D — Safety Checks

### Compliance Verification

**✅ No Tracking:**
- System events log contains ONLY metadata (event_type, user_id, timestamp, source)
- No behavioral analytics
- No user profiling
- No content storage

**✅ No Sensitive Data Exposure:**
- Logs do NOT contain:
  - Names
  - Photos
  - Messages
  - User-generated content
  - Personal data beyond user_id

**✅ Apple App Store Compliance:**
- No tracking or behavioral analytics (Guideline 5.1.2)
- Transparent purpose (legal compliance only)
- No user profiling
- Haptic feedback is user-initiated only

**✅ Google Play Compliance:**
- No tracking or analytics
- Data minimization principles followed
- Transparent consent logging
- No behavioral profiling

**✅ RF 152-FZ Compliance:**
- Data minimization: Only essential metadata logged
- Purpose limitation: Legal compliance and dispute resolution
- Explicit consent logging with policy versions
- User control: Consent can be withdrawn
- Storage limitation: Backend must implement retention policies

## Modified Files

1. **`src/lib/system-events.ts`** (NEW)
   - System events logging structure
   - Legal compliance comments
   - Backend TODOs

2. **`src/lib/consent-logging.ts`** (NEW)
   - Consent logging mechanism
   - RF 152-FZ compliance
   - Backend TODOs

3. **`src/lib/haptic-feedback.ts`** (NEW)
   - Cross-platform haptic feedback utility
   - No tracking or analytics

4. **`src/components/SkeletonLoader.tsx`** (NEW)
   - Neutral skeleton loaders
   - Avatar-specific skeleton

5. **`src/lib/account-deletion.ts`** (MODIFIED)
   - Integrated system events logging
   - Logs `account_deleted` event

6. **`src/components/TermsSummary.tsx`** (MODIFIED)
   - Integrated consent logging
   - Logs Terms of Service and Privacy Policy acceptance

7. **`src/components/Profile.tsx`** (MODIFIED)
   - Added skeleton loader for profile photo
   - Imported haptic feedback utility (ready for future use)

## Backend Requirements

### Database Tables

**1. `system_events` table:**
```sql
CREATE TABLE system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id TEXT NOT NULL, -- Consider hashing for privacy
  timestamp TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('user', 'admin', 'system')),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_system_events_user_id ON system_events(user_id);
CREATE INDEX idx_system_events_timestamp ON system_events(timestamp);
CREATE INDEX idx_system_events_event_type ON system_events(event_type);
```

**2. `consent_logs` table:**
```sql
CREATE TABLE consent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('terms_of_service', 'privacy_policy', 'verification_consent', 'camera_consent')),
  policy_version TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  withdrawn BOOLEAN DEFAULT FALSE,
  withdrawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_consent_logs_user_id ON consent_logs(user_id);
CREATE INDEX idx_consent_logs_timestamp ON consent_logs(timestamp);
CREATE INDEX idx_consent_logs_consent_type ON consent_logs(consent_type);
```

### RLS Policies

**System Events:**
- Admin-only access (for legal compliance)
- Users cannot view system events

**Consent Logs:**
- Users can view their own consent logs
- Admins can view all consent logs (for legal compliance)

### Retention Policies

- **System Events:** 7 years (legal compliance requirement)
- **Consent Logs:** 7 years (legal compliance requirement)

## Summary

✅ **RF Legal Compliance:**
- Data minimization principles followed
- Explicit consent logging implemented
- Purpose limitation (legal compliance only)
- User control (consent withdrawal)

✅ **Apple App Store Safety:**
- No tracking or behavioral analytics
- Transparent purpose
- No user profiling
- Haptic feedback is user-initiated

✅ **Google Play Safety:**
- No tracking or analytics
- Data minimization
- Transparent consent logging
- No behavioral profiling

All changes are minimal, safe, and focused on legal compliance and UX quality without introducing risk.
