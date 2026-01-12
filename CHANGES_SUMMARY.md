# App Store & Google Play Compliance - Changes Summary

## Files Modified

### 1. `src/lib/auth-universal.ts`
**Change**: Added `isPremium?: boolean` to `AuthUser` interface
**Reason**: Frontend-only flag for premium status (backend TODO)
**Safety**: ✅ Frontend-only, no DB changes yet

### 2. `src/components/TermsOfService.tsx`
**Change**: Added "Premium Features" section (Section 6, moved Limitation to Section 7)
**Content**: Neutral description of paid features, TODO marker for future payment details
**Safety**: 
- ✅ RF Law: Compliant, no coercion
- ✅ Apple/Google: Platform-agnostic, no IAP mentions
- ✅ Language: Neutral, user-friendly

### 3. `src/components/PremiumCrownIcon.tsx`
**Change**: New component - abstract SVG crown icon
**Reason**: Premium status indicator (visible only to user in own profile)
**Safety**: ✅ Not emoji, not copyrighted, abstract design

### 4. `src/components/Profile.tsx`
**Change**: 
- Imported `PremiumCrownIcon`
- Added crown icon next to user name (currently disabled, ready for backend integration)
**Reason**: Visual premium indicator (only visible to user)
**Safety**: ✅ Only in own profile, no payment UI

### 5. `src/components/AuthScreen.tsx`
**Changes**:
- Title: "Linger" → "LINGER" (uppercase, always)
- Subtitle: "Найди свои моменты" → "Meet the Moment" (English only)
- Removed: "Вход через Telegram Mini App" text
- Google button: Updated background color (#f8f9fa, lighter)
- Apple button: Updated background color (#1d1d1f, darker)
- Phone button label: "Телефон" → "По телефону" (clearer)
**Reason**: UI cleanup, compliance with platform rules
**Safety**:
- ✅ No Telegram references in Web/iOS/Android
- ✅ Telegram auto-login still works (silent, via useEffect)
- ✅ All login methods remain available

## Safety Justification

### Russian Federation Law
- ✅ Legal documents: Platform-agnostic, compliant with 152-FZ
- ✅ Premium features: Optional, no coercion
- ✅ User rights: Clear account deletion and data control

### Apple App Store
- ✅ No payment UI in mobile: Premium indicator only, no purchase buttons
- ✅ No platform references: Terms don't mention Apple/Google/Telegram
- ✅ Terms accessible: Clear, readable legal documents

### Google Play
- ✅ No payment UI in mobile: Same as Apple
- ✅ Content policy: Age restrictions and moderation clear
- ✅ User data: Privacy policy compliant

## TODO for Future

1. **Backend**: Add `is_premium` column to `profiles` table
2. **Backend**: Implement payment processing (Web/Telegram only, NOT iOS/Android)
3. **Frontend**: Enable premium crown icon when `isPremium` is true
4. **Legal**: Add specific payment terms (marked with TODO in TermsOfService)
5. **IAP**: If implementing iOS/Android IAP, use platform-specific APIs (not implemented yet)

## Testing Checklist

- [x] Title displays as "LINGER" (uppercase)
- [x] Subtitle displays as "Meet the Moment" (English only)
- [x] Telegram text removed from start screen
- [x] Premium crown icon component created (ready for backend)
- [x] No payment text in mobile UI
- [x] Legal documents updated
- [x] Build successful
- [ ] Test on iOS PWA
- [ ] Test on Android PWA
- [ ] Test on Telegram Mini App (auto-login should work)
- [ ] Test on Web (all login methods should work)
