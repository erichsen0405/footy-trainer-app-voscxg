
import React, { useEffect, useState, useCallback } from 'react';
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
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';

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
  const { refreshPlayers } = useTeamPlayer();

  const fetchPlayers = useCallback(async () => {
    try {
      setLoading(true);
      console.log('Fetching players...');
      
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.error('Error getting user:', userError);
        return;
      }

      console.log('Current trainer user ID:', user.id);

      // Get all player relationships for this trainer
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
      
      // CRITICAL FIX: Also refresh the TeamPlayerContext to ensure selector is updated
      await refreshPlayers();
    } catch (error) {
      console.error('Error in fetchPlayers:', error);
    } finally {
      setLoading(false);
    }
  }, [refreshPlayers]);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers, refreshTrigger]);

  const performDelete = async (playerId: string, playerName: string) => {
    console.log('=== STARTING PLAYER REMOVAL OPERATION ===');
    console.log('Player ID:', playerId);
    console.log('Player Name:', playerName);
    
    setDeletingPlayerId(playerId);
    
    try {
      console.log('Calling delete-player Edge Function...');

      // Call the Edge Function to remove the player from trainer's profile
      const { data, error } = await supabase.functions.invoke('delete-player', {
        body: {
          playerId,
        },
      });

      console.log('Edge function response:', { data, error });

      if (error) {
        console.error('Edge function error:', error);
        
        // Try to extract error message
        let errorMessage = 'Kunne ikke fjerne spilleren';
        
        if (error.context && error.context instanceof Response) {
          try {
            const clonedResponse = error.context.clone();
            const errorBody = await clonedResponse.json();
            console.log('Error response body:', errorBody);
            if (errorBody.error) {
              errorMessage = errorBody.error;
            }
          } catch (e) {
            console.error('Could not parse error response:', e);
          }
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        throw new Error(errorMessage);
      }

      if (!data || !data.success) {
        console.error('Edge function returned error:', data);
        const errorMessage = data?.error || 'Kunne ikke fjerne spilleren';
        throw new Error(errorMessage);
      }

      console.log('Player removed successfully from trainer profile');
      
      const message = `${playerName} er blevet fjernet fra din profil.\n\nSpilleren beholder sin egen konto og selvoprettede opgaver og aktiviteter.\n\nDe opgaver og aktiviteter du har tildelt spilleren er blevet slettet.`;

      Alert.alert('Succes', message);
      
      // Refresh the list
      console.log('Refreshing player list...');
      await fetchPlayers();
      console.log('Player list refreshed');
    } catch (error: any) {
      console.error('Error removing player:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      
      let errorMessage = 'Der opstod en fejl ved fjernelse af spilleren';
      if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Fejl', errorMessage);
    } finally {
      console.log('Clearing deletingPlayerId');
      setDeletingPlayerId(null);
      console.log('=== PLAYER REMOVAL OPERATION COMPLETE ===');
    }
  };

  const handleDeletePlayer = (playerId: string, playerName: string) => {
    console.log('=== REMOVE BUTTON PRESSED ===');
    console.log('Remove button pressed for player:', playerId, playerName);
    
    Alert.alert(
      'Fjern spiller',
      `Er du sikker på at du vil fjerne ${playerName} fra din profil?\n\nSpilleren vil blive fjernet fra din liste, og alle opgaver og aktiviteter du har tildelt spilleren vil blive slettet.\n\nSpilleren beholder sin egen konto og selvoprettede opgaver og aktiviteter.`,
      [
        { 
          text: 'Annuller', 
          style: 'cancel',
          onPress: () => {
            console.log('Remove cancelled by user');
          }
        },
        {
          text: 'Fjern',
          style: 'destructive',
          onPress: () => {
            console.log('User confirmed removal, calling performDelete...');
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
            <View key={`player-${player.id}-${player.full_name}`} style={styles.playerCard}>
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
                  console.log('Remove button onPress triggered');
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
                    ios_icon_name="person.badge.minus"
                    android_material_icon_name="person_remove"
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
