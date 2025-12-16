
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase } from '@/app/integrations/supabase/client';
import { colors } from '@/styles/commonStyles';

export default function SubscriptionDiagnostic() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDiagnosticInfo();
  }, []);

  const fetchDiagnosticInfo = async () => {
    try {
      setLoading(true);

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      console.log('[SubscriptionDiagnostic] Current user:', user?.email, user?.id);
      setCurrentUser(user);

      if (userError) {
        console.error('[SubscriptionDiagnostic] Error getting user:', userError);
        return;
      }

      // Get all subscriptions (for diagnostic purposes only - using service role would be needed in production)
      const { data: subs, error: subsError } = await supabase
        .from('subscriptions')
        .select(`
          *,
          subscription_plans (
            name,
            max_players
          )
        `);

      console.log('[SubscriptionDiagnostic] All subscriptions:', subs);
      setSubscriptions(subs || []);

      if (subsError) {
        console.error('[SubscriptionDiagnostic] Error getting subscriptions:', subsError);
      }
    } catch (error) {
      console.error('[SubscriptionDiagnostic] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.text}>Henter diagnostik...</Text>
      </View>
    );
  }

  const userHasSubscription = subscriptions.some(sub => sub.admin_id === currentUser?.id);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔍 Abonnement Diagnostik</Text>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Nuværende bruger:</Text>
        <Text style={styles.text}>Email: {currentUser?.email || 'Ikke logget ind'}</Text>
        <Text style={styles.text}>ID: {currentUser?.id || 'N/A'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Abonnementer i databasen:</Text>
        {subscriptions.length === 0 ? (
          <Text style={styles.text}>Ingen abonnementer fundet</Text>
        ) : (
          subscriptions.map((sub, index) => (
            <View key={index} style={styles.subscriptionCard}>
              <Text style={styles.text}>
                Plan: {sub.subscription_plans?.name || 'Ukendt'}
              </Text>
              <Text style={styles.text}>
                Status: {sub.status}
              </Text>
              <Text style={styles.text}>
                Admin ID: {sub.admin_id}
              </Text>
              <Text style={[styles.text, { fontWeight: 'bold', color: sub.admin_id === currentUser?.id ? colors.success : colors.error }]}>
                {sub.admin_id === currentUser?.id ? '✅ Dette er DIT abonnement' : '❌ Dette abonnement tilhører en anden bruger'}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Diagnose:</Text>
        {userHasSubscription ? (
          <Text style={[styles.text, { color: colors.success }]}>
            ✅ Du har et abonnement! Hvis det ikke vises, prøv at genindlæse siden.
          </Text>
        ) : (
          <Text style={[styles.text, { color: colors.error }]}>
            ❌ Du har IKKE et abonnement på denne konto.
            {subscriptions.length > 0 && (
              <Text>
                {'\n\n'}Der findes abonnementer i systemet, men de tilhører en anden bruger.
                {'\n\n'}Løsning: Log ud og log ind med den korrekte konto, eller opret et nyt abonnement på denne konto.
              </Text>
            )}
          </Text>
        )}
      </View>

      <TouchableOpacity style={styles.button} onPress={handleLogout}>
        <Text style={styles.buttonText}>Log ud og prøv igen</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, { backgroundColor: colors.secondary }]} onPress={fetchDiagnosticInfo}>
        <Text style={styles.buttonText}>Opdater diagnostik</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: colors.card,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 10,
  },
  text: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 5,
  },
  subscriptionCard: {
    padding: 10,
    backgroundColor: colors.background,
    borderRadius: 8,
    marginBottom: 10,
  },
  button: {
    backgroundColor: colors.primary,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
