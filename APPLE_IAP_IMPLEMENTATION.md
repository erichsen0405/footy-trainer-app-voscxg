
# Apple In-App Purchase Implementation Guide

## Overview

This app now uses **Apple In-App Purchases (StoreKit)** for subscription management on iOS. This implementation is fully compliant with Apple's App Store guidelines and ready for App Review.

## Product IDs

The following subscription products are configured in App Store Connect:

- `com.footballcoach.sub.player` - Spiller (9 kr/md) - 1 player
- `com.footballcoach.sub.trainer.basic` - Træner Basis (39 kr/md) - 5 players
- `com.footballcoach.sub.trainer.standard` - Træner Standard (59 kr/md) - 15 players
- `com.footballcoach.sub.trainer.premium` - Træner Premium (99 kr/md) - 50 players

## Architecture

### Client-Side Components

1. **AppleIAPContext** (`contexts/AppleIAPContext.tsx`)
   - Manages IAP connection and state
   - Fetches products from App Store
   - Handles purchase flow
   - Manages subscription status
   - Implements restore purchases

2. **AppleSubscriptionManager** (`components/AppleSubscriptionManager.tsx`)
   - UI component for displaying subscription plans
   - Handles plan selection and purchase initiation
   - Shows current subscription status
   - Provides "Restore Purchases" button

3. **useSubscriptionFeatures** (`hooks/useSubscriptionFeatures.ts`)
   - Hook for accessing subscription features
   - Provides max player count
   - Checks if user can add more players
   - Works across iOS and other platforms

### Database Schema

The `profiles` table has been extended with the following columns:

```sql
- subscription_tier TEXT - Subscription tier (player, trainer_basic, trainer_standard, trainer_premium)
- subscription_product_id TEXT - Apple product ID
- subscription_receipt TEXT - Apple transaction receipt
- subscription_updated_at TIMESTAMPTZ - Last update timestamp
```

## Implementation Details

### Purchase Flow

1. User selects a subscription plan
2. `purchaseSubscription()` is called with the product ID
3. StoreKit presents the Apple payment sheet
4. User completes purchase (or cancels)
5. Purchase listener receives the transaction
6. Transaction is finished with `finishTransaction()`
7. Subscription data is saved to Supabase `profiles` table
8. UI updates to show active subscription

### Restore Purchases

Users can restore their purchases by tapping the "Gendan køb" button. This:

1. Fetches all available purchases from Apple
2. Updates the subscription status
3. Syncs with Supabase
4. Shows confirmation to user

### Subscription Status

The app checks subscription status by:

1. Querying `getAvailablePurchases()` from StoreKit
2. Finding the most recent subscription
3. Checking expiry date (30 days from purchase)
4. Updating UI accordingly

**Note:** In production, Apple automatically handles subscription renewals and trial periods.

### Feature Gating

Use the `useSubscriptionFeatures` hook to gate features:

```typescript
const { hasActiveSubscription, maxPlayers, canAddMorePlayers } = useSubscriptionFeatures();

if (!hasActiveSubscription) {
  // Show subscription prompt
}

if (!canAddMorePlayers(currentPlayerCount)) {
  // Show upgrade prompt
}
```

## Testing

### Sandbox Testing (TestFlight)

1. Create a Sandbox tester account in App Store Connect
2. Sign out of your Apple ID on the device
3. Install the app via TestFlight
4. When prompted, sign in with the Sandbox tester account
5. Test purchases (they're free in Sandbox)
6. Test restore purchases
7. Test subscription expiry (Sandbox subscriptions renew faster)

### Production Testing

1. Submit app for App Review
2. Once approved, test with real purchases
3. Verify subscription renewals
4. Test cancellation flow via App Store settings

## App Store Connect Configuration

### Required Setup

1. **Agreements, Tax, and Banking**
   - Complete all required agreements
   - Set up banking information
   - Configure tax information

2. **In-App Purchases**
   - Create auto-renewable subscription group
   - Add all 4 subscription products
   - Set pricing for each tier
   - Configure subscription duration (1 month)
   - Set up free trial (14 days)

3. **App Information**
   - Add subscription terms and conditions
   - Configure privacy policy URL
   - Set up subscription management URL

4. **App Review Information**
   - Provide test account credentials
   - Explain subscription features
   - Describe how users can cancel

## Compliance

### Apple Guidelines

✅ Uses native Apple In-App Purchases
✅ No external payment links
✅ Provides "Restore Purchases" button
✅ Subscription management via App Store
✅ Clear pricing display
✅ 14-day free trial included
✅ No misleading subscription terms

### User Experience

- Clear subscription plan display
- Transparent pricing in local currency
- Easy plan switching
- Simple cancellation via App Store
- Restore purchases functionality
- Active subscription indicator

## Subscription Management

Users can manage their subscriptions via:

1. **iOS Settings**
   - Settings → [User Name] → Subscriptions

2. **App Store**
   - App Store → Profile → Subscriptions

3. **In-App**
   - Profile → Subscription → Manage via App Store

## Troubleshooting

### Common Issues

**Issue:** Products not loading
- **Solution:** Verify product IDs match App Store Connect
- **Solution:** Ensure app bundle ID matches
- **Solution:** Check App Store Connect agreements are signed

**Issue:** Purchase fails
- **Solution:** Verify Sandbox tester account is signed in
- **Solution:** Check device has payment method configured
- **Solution:** Ensure product is available in the region

**Issue:** Restore purchases doesn't work
- **Solution:** Verify user is signed in with correct Apple ID
- **Solution:** Check if purchases were made with different Apple ID
- **Solution:** Ensure app bundle ID matches

### Debugging

Enable detailed logging:

```typescript
console.log('[AppleIAP] ...');
```

All IAP operations are logged with the `[AppleIAP]` prefix for easy filtering.

## Migration from Old System

The old Supabase Edge Function subscription system has been replaced. To migrate existing users:

1. Users will need to purchase a new subscription via Apple IAP
2. Old subscription data in `subscriptions` table is preserved but not used
3. New subscription data is stored in `profiles` table
4. Feature gating now uses `useSubscriptionFeatures` hook

## Future Enhancements

Potential improvements:

- Server-side receipt validation via Apple's API
- Subscription analytics and metrics
- Promotional offers and discount codes
- Family sharing support
- Subscription upgrade/downgrade flow
- Grace period handling
- Billing retry management

## Support

For issues or questions:

1. Check Apple's IAP documentation
2. Review StoreKit logs in Xcode
3. Test in Sandbox environment first
4. Contact Apple Developer Support for App Store issues

## Resources

- [Apple In-App Purchase Documentation](https://developer.apple.com/in-app-purchase/)
- [StoreKit Documentation](https://developer.apple.com/documentation/storekit)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [react-native-iap Documentation](https://github.com/dooboolab-community/react-native-iap)
