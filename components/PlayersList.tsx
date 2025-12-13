
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

  const performDelete = async (playerId: string, playerName: string) => {
    console.log('=== STARTING DELETE OPERATION ===');
    console.log('Player ID:', playerId);
    console.log('Player Name:', playerName);
    
    setDeletingPlayerId(playerId);
    
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.error('Error getting user:', userError);
        Alert.alert('Fejl', 'Kunne ikke hente bruger');
        return;
      }

      console.log('Current admin user ID:', user.id);
      console.log('Attempting to delete relationship where admin_id =', user.id, 'AND player_id =', playerId);

      // First, let's verify the relationship exists
      const { data: existingRel, error: checkError } = await supabase
        .from('admin_player_relationships')
        .select('*')
        .eq('admin_id', user.id)
        .eq('player_id', playerId);

      console.log('Existing relationship check:', existingRel);
      console.log('Check error:', checkError);

      if (checkError) {
        console.error('Error checking relationship:', checkError);
        Alert.alert('Fejl', `Kunne ikke verificere relation: ${checkError.message}`);
        return;
      }

      if (!existingRel || existingRel.length === 0) {
        console.warn('No relationship found to delete');
        Alert.alert('Fejl', 'Relationen findes ikke');
        return;
      }

      // Now perform the delete
      console.log('Executing delete operation...');
      const { data, error, status, statusText } = await supabase
        .from('admin_player_relationships')
        .delete()
        .eq('admin_id', user.id)
        .eq('player_id', playerId)
        .select();

      console.log('Delete operation completed');
      console.log('Delete result - data:', data);
      console.log('Delete result - error:', error);
      console.log('Delete result - status:', status);
      console.log('Delete result - statusText:', statusText);

      if (error) {
        console.error('Delete error details:', JSON.stringify(error, null, 2));
        Alert.alert('Fejl', `Kunne ikke slette: ${error.message}`);
        return;
      }

      if (!data || data.length === 0) {
        console.warn('No rows were deleted. This might mean RLS prevented deletion.');
        Alert.alert('Fejl', 'Ingen rækker blev slettet. RLS politikken kan have forhindret sletningen.');
        return;
      }

      console.log('Successfully deleted player relationship');
      Alert.alert('Succes', `${playerName} er fjernet fra din liste`);
      
      // Refresh the list
      console.log('Refreshing player list...');
      await fetchPlayers();
      console.log('Player list refreshed');
    } catch (error: any) {
      console.error('Error deleting player relationship:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      Alert.alert(
        'Fejl', 
        `Kunne ikke fjerne spilleren.\n\nFejl: ${error.message || 'Ukendt fejl'}`
      );
    } finally {
      console.log('Clearing deletingPlayerId');
      setDeletingPlayerId(null);
      console.log('=== DELETE OPERATION COMPLETE ===');
    }
  };

  const handleDeletePlayer = (playerId: string, playerName: string) => {
    console.log('=== DELETE BUTTON PRESSED ===');
    console.log('Delete button pressed for player:', playerId, playerName);
    
    Alert.alert(
      'Slet spillerprofil',
      `Er du sikker på at du vil fjerne ${playerName} som din spiller?\n\nDette sletter ikke spillerens konto, men fjerner kun relationen mellem jer.`,
      [
        { 
          text: 'Annuller', 
          style: 'cancel',
          onPress: () => {
            console.log('Delete cancelled by user');
          }
        },
        {
          text: 'Fjern',
          style: 'destructive',
          onPress: () => {
            console.log('User confirmed delete, calling performDelete...');
            // Use setTimeout to ensure the Alert is dismissed before starting the async operation
            setTimeout(() => {
              performDelete(playerId, playerName);
            }, 100);
          },
        },
      ],
      { cancelable: true }
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
                onPress={() => {
                  console.log('Delete button onPress triggered');
                  handleDeletePlayer(player.id, player.full_name);
                }}
                disabled={deletingPlayerId === player.id}
                activeOpacity={0.6}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {deletingPlayerId === player.id ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <IconSymbol
                    ios_icon_name="trash"
                    android_material_icon_name="delete"
                    size={22}
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
    minHeight: 200,
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
    minHeight: 200,
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
    padding: 12,
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },
});
