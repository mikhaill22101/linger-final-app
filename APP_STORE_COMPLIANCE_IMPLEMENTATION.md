# App Store & Google Play Compliance Implementation

## Summary

This document describes changes made to ensure compliance with:
- Apple App Store Review Guidelines
- Google Play User Data & Safety Policies
- Russian Federation digital services law

## Changes Made

### A) Legal Documents

1. **TermsOfService.tsx** - Updated with Premium Features section
   - Platform-agnostic language
   - NO mentions of Apple, Google, Telegram, payment providers
   - Neutral description: "some features may be available on a paid basis"
   - TODO markers for future payment details

2. **PrivacyPolicy.tsx** - Already compliant, no changes needed

### B) Premium Feature Preparation

1. **src/lib/auth-universal.ts** - Added `isPremium?: boolean` to AuthUser interface
   - Frontend-only flag (not stored in DB yet)
   - TODO comment for future backend integration

2. **src/components/PremiumCrownIcon.tsx** - New component
   - Simple SVG crown icon (not emoji, not copyrighted)
   - Abstract gold design
   - Reusable component

3. **src/components/Profile.tsx** - Added premium crown icon
   - Visible ONLY in user's own profile
   - NOT visible to other users
   - Positioned next to user name/avatar

### C) Authentication & Platform Rules

1. **src/components/AuthScreen.tsx** - Removed Telegram login references
   - Removed "Вход через Telegram Mini App" text from start screen
   - Telegram auto-login still works (via useEffect, no UI)
   - Telegram login button removed (never existed, confirmed)
   - Email/Phone/Apple/Google login buttons remain

### D) Start Screen UI Cleanup

1. **src/components/AuthScreen.tsx** - Updated title and subtitle
   - Title: "LINGER" (uppercase, always)
   - Subtitle: "Meet the Moment" (English only, not localized)

2. **src/components/AuthScreen.tsx** - Improved login buttons
   - Google button: Slightly lighter background (#f8f9fa)
   - Apple button: Darker background (#1d1d1f) with subtle border
   - Phone button: Added clear label "Continue with phone number"
   - Consistent with app's color palette

### E) Payment Text Removal

- Verified: No payment/subscription/billing text in mobile UI
- All premium references use neutral language
- TODO comments added where future payments MAY be added

## Files Modified

1. `src/lib/auth-universal.ts` - Added isPremium flag
2. `src/components/TermsOfService.tsx` - Added Premium Features section
3. `src/components/AuthScreen.tsx` - UI cleanup, removed Telegram text
4. `src/components/Profile.tsx` - Added premium crown icon
5. `src/components/PremiumCrownIcon.tsx` - New component (created)

## Safety Justification

### Russian Federation Law Compliance

- **Legal Documents**: Use neutral, platform-agnostic language
- **Premium Features**: Described as optional, no coercion
- **Data Protection**: Privacy policy complies with 152-FZ
- **User Rights**: Account deletion and data control clearly stated

### Apple App Store Compliance

- **No Payment UI in Mobile**: Premium status visible only to user, no purchase buttons
- **No Platform References**: No mentions of Apple, Google, Telegram in legal docs
- **Terms of Service**: Clear and accessible
- **Privacy Policy**: Complies with App Store requirements

### Google Play Compliance

- **No Payment UI in Mobile**: Same as Apple
- **No Platform References**: Same as Apple
- **User Data**: Clear privacy policy
- **Content Policy**: Age restrictions and moderation clearly stated

## TODO for Future Payment Integration

1. Backend: Add `is_premium` column to `profiles` table
2. Backend: Implement payment processing (Web/Telegram only)
3. Frontend: Add premium features UI (only for premium users)
4. Legal: Add specific payment terms (marked with TODO in TermsOfService)
5. IAP: If implementing iOS/Android IAP, use platform-specific APIs (not implemented yet)

## Testing Checklist

- [ ] Verify title displays as "LINGER" (uppercase)
- [ ] Verify subtitle displays as "Meet the Moment" (English only)
- [ ] Verify Telegram text removed from start screen
- [ ] Verify premium crown only visible in own profile
- [ ] Verify no payment text in mobile UI
- [ ] Verify legal documents are accessible
- [ ] Test on iOS PWA
- [ ] Test on Android PWA
- [ ] Test on Telegram Mini App (auto-login should work)
- [ ] Test on Web (all login methods should work)
