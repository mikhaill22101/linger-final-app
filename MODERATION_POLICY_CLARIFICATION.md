# Moderation Policy Clarification

## Clear Separation of Responsibilities

### 1. Registration Age Verification

**Requirements:**
- ✅ Date of birth is **mandatory** during registration
- ✅ Registration is **blocked** if age < 18
- ✅ Mandatory checkbox: "I confirm that I am 18+ and accept the Terms of Service"
- ✅ Submit button is **disabled** until checkbox is checked
- ✅ `age_confirmed = true` is stored with timestamp

**Implementation:**
- Client-side validation in `AuthScreen.tsx`
- Server-side validation in `signUpWithEmail()`
- Age calculation accounts for month and day
- Invalid dates (future dates) are rejected

### 2. Underage User Detection

**Policy:**
- ❌ **DO NOT** proactively scan messages
- ✅ **Act only** on reports or explicit evidence
- ✅ If underage suspicion arises:
  - Immediately ban the account
  - Log reason and evidence in `moderation_logs`

**Implementation:**
- `handleUnderageUser()` function in `src/lib/age-verification.ts`
- Only called when:
  - User is reported for being underage
  - Explicit evidence is provided
  - User admits to being underage
- Automatic ban with full logging
- No admin review required for underage bans (immediate action)

**Detection Triggers:**
- Report contains keywords: "несовершеннолетн", "underage", "младше 18", "less than 18"
- Explicit statement in report description
- User-provided evidence

### 3. Moderation Workflow

**Policy:**
- ✅ Reports trigger **review**, not automatic ban
- ✅ Admin **must confirm** before permanent ban
- ✅ All actions are **logged** with details

**Implementation:**
- `increment_report_count()` trigger:
  - Only increments report counter
  - **NO automatic restrictions or bans**
  - Counter used for prioritization in admin panel
- Admin panel (`AdminModerationPanel.tsx`):
  - Shows all pending reports
  - Requires confirmation dialog before ban
  - Requires confirmation before messaging restriction
  - All actions logged with moderator ID and timestamp

**Moderation Actions:**
1. **Ban User:**
   - Requires confirmation dialog
   - Logs action with full details
   - Updates report status to "resolved"
   - Irreversible without admin unban

2. **Restrict Messaging:**
   - Requires confirmation dialog
   - Temporary restriction (default 7 days)
   - Logs action with duration
   - Updates report status to "reviewed"

3. **Dismiss Report:**
   - Updates report status to "dismissed"
   - Logs dismissal reason
   - No user action taken

### 4. Policy Enforcement

**Allowed:**
- ✅ Exchange of contacts for personal use
- ✅ Personal communication
- ✅ Organizing personal meetings

**Prohibited:**
- ❌ Commercial activity
- ❌ Paid meetings/services
- ❌ Sexual services
- ❌ Illegal activity
- ❌ Spam and intrusive advertising

**Platform Classification:**
- Technical communication service
- Does not organize, recommend, or supervise meetings
- Users act on their own initiative
- Platform provides tools only

**Terms of Service Clarification:**
- Updated to explicitly state:
  - "Exchange of contacts for personal use is allowed"
  - "Platform prohibits only commercial and illegal activity"

## Database Schema

### Reports Table
- `status`: pending → reviewed/resolved/dismissed
- No automatic status changes
- Admin review required for all actions

### Moderation Logs
- All actions logged with:
  - Moderator ID (NULL for automatic underage bans)
  - Target user ID
  - Action type
  - Reason
  - Evidence/details (JSONB)
  - Timestamp

### Profiles
- `is_banned`: Set only after admin confirmation (except underage)
- `messaging_restricted`: Set only after admin confirmation
- `report_count`: Used for prioritization only

## Workflow Examples

### Example 1: Underage Report
1. User reports: "This user is under 18"
2. System detects underage keywords
3. `handleUnderageUser()` called immediately
4. Account banned automatically
5. Action logged with evidence
6. No admin review needed

### Example 2: Regular Report
1. User reports: "Spam messages"
2. Report saved with status "pending"
3. `report_count` incremented
4. Report appears in admin panel
5. Admin reviews report
6. Admin confirms ban action
7. Account banned
8. Action logged with moderator ID

### Example 3: Multiple Reports
1. User receives 3+ reports
2. `report_count` = 3
3. Report appears in admin panel (prioritized)
4. **NO automatic action taken**
5. Admin reviews all reports
6. Admin confirms appropriate action
7. Action taken and logged

## Key Principles

1. **No Proactive Scanning:**
   - System does not scan messages for content
   - Only acts on explicit reports or evidence

2. **Admin Review Required:**
   - All moderation actions (except underage) require admin confirmation
   - No automatic bans or restrictions

3. **Full Logging:**
   - Every action is logged with:
     - Who performed it
     - When it was performed
     - Why it was performed
     - Evidence/details

4. **Immediate Underage Action:**
   - Underage reports trigger immediate ban
   - No admin review needed (legal requirement)
   - Full evidence logged

5. **Clear Policy:**
   - Contact exchange allowed for personal use
   - Only commercial/illegal activity prohibited
   - Platform is technical service, not organizer
