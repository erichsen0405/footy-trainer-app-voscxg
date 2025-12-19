
# How to Use Apple IAP Subscriptions in Your App

## Basic Usage

### 1. Display Subscription Plans

```typescript
import AppleSubscriptionManager from '@/components/AppleSubscriptionManager';

function SubscriptionScreen() {
  return (
    <View style={{ flex: 1, padding: 20 }}>
      <AppleSubscriptionManager />
    </View>
  );
}
```

### 2. Check Subscription Status

```typescript
import { useSubscriptionFeatures } from '@/hooks/useSubscriptionFeatures';

function MyComponent() {
  const { 
    hasActiveSubscription, 
    maxPlayers, 
    subscriptionTier,
    canAddMorePlayers,
    isLoading 
  } = useSubscriptionFeatures();

  if (isLoading) {
    return <ActivityIndicator />;
  }

  if (!hasActiveSubscription) {
    return (
      <View>
        <Text>Du har ikke et aktivt abonnement</Text>
        <Button title="Køb abonnement" onPress={() => {/* Navigate to subscription screen */}} />
      </View>
    );
  }

  return (
    <View>
      <Text>Aktiv plan: {subscriptionTier}</Text>
      <Text>Max spillere: {maxPlayers}</Text>
    </View>
  );
}
```

### 3. Gate Features Based on Subscription

```typescript
import { useSubscriptionFeatures } from '@/hooks/useSubscriptionFeatures';
import { Alert } from 'react-native';

function AddPlayerButton() {
  const { canAddMorePlayers } = useSubscriptionFeatures();
  const [currentPlayerCount, setCurrentPlayerCount] = useState(0);

  const handleAddPlayer = () => {
    if (!canAddMorePlayers(currentPlayerCount)) {
      Alert.alert(
        'Opgrader dit abonnement',
        'Du har nået det maksimale antal spillere for din plan. Opgrader for at tilføje flere spillere.',
        [
          { text: 'Annuller', style: 'cancel' },
          { text: 'Se planer', onPress: () => {/* Navigate to subscription screen */} }
        ]
      );
      return;
    }

    // Add player logic
  };

  return (
    <Button title="Tilføj spiller" onPress={handleAddPlayer} />
  );
}
```

### 4. Show Current Subscription in Profile

```typescript
import { useAppleIAP } from '@/contexts/AppleIAPContext';

function ProfileScreen() {
  const { subscriptionStatus, products } = useAppleIAP();

  const currentProduct = products.find(
    p => p.productId === subscriptionStatus?.productId
  );

  return (
    <View>
      {subscriptionStatus?.isActive ? (
        <View>
          <Text>Aktiv plan: {currentProduct?.title}</Text>
          <Text>Pris: {currentProduct?.localizedPrice}/måned</Text>
          <Button title="Administrer abonnement" onPress={() => {
            // Open App Store subscription management
            Linking.openURL('https://apps.apple.com/account/subscriptions');
          }} />
        </View>
      ) : (
        <View>
          <Text>Ingen aktiv plan</Text>
          <Button title="Køb abonnement" onPress={() => {/* Navigate to subscription screen */}} />
        </View>
      )}
    </View>
  );
}
```

### 5. Restore Purchases

```typescript
import { useAppleIAP } from '@/contexts/AppleIAPContext';

function RestorePurchasesButton() {
  const { restorePurchases } = useAppleIAP();

  return (
    <Button 
      title="Gendan køb" 
      onPress={restorePurchases}
    />
  );
}
```

## Advanced Usage

### Custom Subscription Check

```typescript
import { useAppleIAP } from '@/contexts/AppleIAPContext';

function useIsTrainer() {
  const { subscriptionStatus, products } = useAppleIAP();

  if (!subscriptionStatus?.isActive || !subscriptionStatus.productId) {
    return false;
  }

  const product = products.find(p => p.productId === subscriptionStatus.productId);
  return product ? product.maxPlayers > 1 : false;
}

// Usage
function TrainerOnlyFeature() {
  const isTrainer = useIsTrainer();

  if (!isTrainer) {
    return <Text>Denne funktion er kun tilgængelig for trænere</Text>;
  }

  return <TrainerContent />;
}
```

### Subscription Tier Comparison

```typescript
const SUBSCRIPTION_TIERS = {
  player: { level: 1, maxPlayers: 1 },
  trainer_basic: { level: 2, maxPlayers: 5 },
  trainer_standard: { level: 3, maxPlayers: 15 },
  trainer_premium: { level: 4, maxPlayers: 50 },
};

function useSubscriptionLevel() {
  const { subscriptionTier } = useSubscriptionFeatures();
  return SUBSCRIPTION_TIERS[subscriptionTier as keyof typeof SUBSCRIPTION_TIERS]?.level || 0;
}

function PremiumFeature({ requiredLevel }: { requiredLevel: number }) {
  const currentLevel = useSubscriptionLevel();

  if (currentLevel < requiredLevel) {
    return (
      <View>
        <Text>Denne funktion kræver en højere abonnementsplan</Text>
        <Button title="Opgrader" onPress={() => {/* Navigate to subscription screen */}} />
      </View>
    );
  }

  return <PremiumContent />;
}
```

## Platform-Specific Handling

```typescript
import { Platform } from 'react-native';

function SubscriptionButton() {
  if (Platform.OS !== 'ios') {
    return (
      <View>
        <Text>Abonnementer er kun tilgængelige i iOS appen</Text>
        <Text>Download appen fra App Store</Text>
      </View>
    );
  }

  return <AppleSubscriptionManager />;
}
```

## Error Handling

```typescript
import { useAppleIAP } from '@/contexts/AppleIAPContext';
import { Alert } from 'react-native';

function PurchaseButton({ productId }: { productId: string }) {
  const { purchaseSubscription, purchasing } = useAppleIAP();

  const handlePurchase = async () => {
    try {
      await purchaseSubscription(productId);
      // Success is handled by the context
    } catch (error) {
      console.error('Purchase error:', error);
      Alert.alert(
        'Fejl',
        'Der opstod en fejl ved køb. Prøv venligst igen.',
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <Button 
      title={purchasing ? 'Behandler...' : 'Køb nu'}
      onPress={handlePurchase}
      disabled={purchasing}
    />
  );
}
```

## Testing Checklist

- [ ] Products load correctly from App Store
- [ ] Purchase flow works in Sandbox
- [ ] Restore purchases works
- [ ] Subscription status updates after purchase
- [ ] Feature gating works correctly
- [ ] UI updates when subscription changes
- [ ] Error handling works properly
- [ ] Cancellation flow works via App Store
- [ ] Trial period is applied correctly
- [ ] Subscription renewal works (in Sandbox, renewals are faster)

## Common Patterns

### Subscription Prompt Modal

```typescript
function SubscriptionPromptModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide">
      <View style={{ flex: 1 }}>
        <TouchableOpacity onPress={onClose} style={{ padding: 20 }}>
          <Text>✕ Luk</Text>
        </TouchableOpacity>
        <AppleSubscriptionManager />
      </View>
    </Modal>
  );
}
```

### Subscription Badge

```typescript
function SubscriptionBadge() {
  const { subscriptionTier } = useSubscriptionFeatures();

  if (!subscriptionTier) return null;

  const getBadgeColor = () => {
    if (subscriptionTier.includes('premium')) return '#FFD700';
    if (subscriptionTier.includes('standard')) return '#C0C0C0';
    if (subscriptionTier.includes('basic')) return '#CD7F32';
    return '#4CAF50';
  };

  return (
    <View style={{ 
      backgroundColor: getBadgeColor(), 
      paddingHorizontal: 12, 
      paddingVertical: 4, 
      borderRadius: 12 
    }}>
      <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>
        {subscriptionTier.toUpperCase()}
      </Text>
    </View>
  );
}
```
