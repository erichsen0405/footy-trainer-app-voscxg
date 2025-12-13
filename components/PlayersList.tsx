
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { supabase } from '@/app/integrations/supabase/client';

interface Player {
  id: string;
  email: string;
  full_name: string;
  phone_number: string;
}

interface PlayersListProps {
  onCreatePlayer: () => void;
  refreshTrigger?: number;
}

export default function PlayersList({ onCreatePlayer, refreshTrigger }: PlayersListProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingPlayerId, setDeletingPlayerId] = useState<string | null>(null);

  const fetchPlayers = async () => {
    try {
      setLoading(true);
      console.log('Fetching players...');
      
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.error('Error getting user:', userError);
        return;
      }

      console.log('Current admin user ID:', user.id);

      // Get all player relationships for this admin
      const { data: relationships, error: relError } = await supabase
        .from('admin_player_relationships')
        .select('player_id')
        .eq('admin_id', user.id);

      if (relError) {
        console.error('Error fetching relationships:', relError);
        return;
      }

      console.log('Found relationships:', relationships);

      if (!relationships || relationships.length === 0) {
        console.log('No player relationships found');
        setPlayers([]);
        return;
      }

      const playerIds = relationships.map(rel => rel.player_id);
      console.log('Player IDs:', playerIds);

      // Get profiles for all players
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name, phone_number')
        .in('user_id', playerIds);

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        return;
      }

      console.log('Found profiles:', profiles);

      const playersData: Player[] = profiles?.map(profile => ({
        id: profile.user_id,
        email: '', // Email not available through RLS
        full_name: profile.full_name || 'Unavngivet',
        phone_number: profile.phone_number || '',
      })) || [];

      console.log('Players data:', playersData);
      setPlayers(playersData);
    } catch (error) {
      console.error('Error in fetchPlayers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers();
  }, [refreshTrigger]);

  const handleDeletePlayer = async (playerId: string, playerName: string) => {
    Alert.alert(
      'Slet spillerprofil',
      `Er du sikker på at du vil fjerne ${playerName} som din spiller?\n\nDette sletter ikke spillerens konto, men fjerner kun relationen mellem jer.`,
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Fjern',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingPlayerId(playerId);
              console.log('Starting delete process for player:', playerId);
              
              // Get current user
              const { data: { user }, error: userError } = await supabase.auth.getUser();
              
              if (userError || !user) {
                console.error('Error getting user:', userError);
                throw new Error('Kunne ikke hente bruger');
              }

              console.log('Current admin user ID:', user.id);
              console.log('Attempting to delete relationship:', { admin_id: user.id, player_id: playerId });

              // Delete the relationship
              const { data, error, count } = await supabase
                .from('admin_player_relationships')
                .delete()
                .eq('admin_id', user.id)
                .eq('player_id', playerId)
                .select();

              console.log('Delete result:', { data, error, count });

              if (error) {
                console.error('Delete error:', error);
                throw error;
              }

              console.log('Successfully deleted player relationship');
              Alert.alert('Succes', 'Spilleren er fjernet fra din liste');
              
              // Refresh the list
              await fetchPlayers();
            } catch (error: any) {
              console.error('Error deleting player relationship:', error);
              Alert.alert(
                'Fejl', 
                `Kunne ikke fjerne spilleren.\n\nFejl: ${error.message || 'Ukendt fejl'}`
              );
            } finally {
              setDeletingPlayerId(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Henter spillere...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mine Spillere</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={onCreatePlayer}
        >
          <IconSymbol
            ios_icon_name="plus"
            android_material_icon_name="add"
            size={20}
            color="#fff"
          />
          <Text style={styles.addButtonText}>Tilføj Spiller</Text>
        </TouchableOpacity>
      </View>

      {players.length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol
            ios_icon_name="person.2"
            android_material_icon_name="group"
            size={64}
            color={colors.textSecondary}
          />
          <Text style={styles.emptyTitle}>Ingen spillere endnu</Text>
          <Text style={styles.emptyText}>
            Tryk på &quot;Tilføj Spiller&quot; for at oprette din første spillerprofil
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.playersList} showsVerticalScrollIndicator={false}>
          {players.map((player) => (
            <View key={player.id} style={styles.playerCard}>
              <View style={styles.playerIcon}>
                <IconSymbol
                  ios_icon_name="person.fill"
                  android_material_icon_name="person"
                  size={32}
                  color={colors.primary}
                />
              </View>
              <View style={styles.playerInfo}>
                <Text style={styles.playerName}>{player.full_name}</Text>
                {player.phone_number && (
                  <View style={styles.playerDetail}>
                    <IconSymbol
                      ios_icon_name="phone.fill"
                      android_material_icon_name="phone"
                      size={14}
                      color={colors.textSecondary}
                    />
                    <Text style={styles.playerDetailText}>{player.phone_number}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeletePlayer(player.id, player.full_name)}
                disabled={deletingPlayerId === player.id}
              >
                {deletingPlayerId === player.id ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <IconSymbol
                    ios_icon_name="trash"
                    android_material_icon_name="delete"
                    size={20}
                    color={colors.error}
                  />
                )}
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  playersList: {
    flex: 1,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 16,
  },
  playerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerInfo: {
    flex: 1,
    gap: 6,
  },
  playerName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  playerDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  playerDetailText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  deleteButton: {
    padding: 8,
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
