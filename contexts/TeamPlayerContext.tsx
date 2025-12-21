
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/app/integrations/supabase/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Team {
  id: string;
  admin_id: string;
  name: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Player {
  id: string;
  email: string;
  full_name: string;
  phone_number?: string;
}

export type SelectionType = 'player' | 'team' | null;

export interface SelectedContext {
  type: SelectionType;
  id: string | null;
  name: string | null;
}

interface TeamPlayerContextType {
  teams: Team[];
  players: Player[];
  selectedContext: SelectedContext;
  loading: boolean;
  setSelectedContext: (context: SelectedContext) => Promise<void>;
  refreshTeams: () => Promise<void>;
  refreshPlayers: () => Promise<void>;
  createTeam: (name: string, description?: string) => Promise<Team>;
  updateTeam: (teamId: string, name: string, description?: string) => Promise<void>;
  deleteTeam: (teamId: string) => Promise<void>;
  addPlayerToTeam: (teamId: string, playerId: string) => Promise<void>;
  removePlayerFromTeam: (teamId: string, playerId: string) => Promise<void>;
  getTeamMembers: (teamId: string) => Promise<Player[]>;
}

const TeamPlayerContext = createContext<TeamPlayerContextType | undefined>(undefined);

const SELECTED_CONTEXT_KEY = '@selected_context';

export function TeamPlayerProvider({ children }: { children: ReactNode }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedContext, setSelectedContextState] = useState<SelectedContext>({
    type: null,
    id: null,
    name: null,
  });
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('TeamPlayerContext - Current user:', user?.id);
      setUserId(user?.id || null);
    };
    getCurrentUser();
  }, []);

  // Load saved selection from AsyncStorage
  useEffect(() => {
    const loadSavedSelection = async () => {
      try {
        const saved = await AsyncStorage.getItem(SELECTED_CONTEXT_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          console.log('Loaded saved selection:', parsed);
          setSelectedContextState(parsed);
        }
      } catch (error) {
        console.error('Error loading saved selection:', error);
      }
    };
    loadSavedSelection();
  }, []);

  // Refresh teams
  const refreshTeams = useCallback(async () => {
    if (!userId) return;

    try {
      console.log('Fetching teams for admin:', userId);
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('admin_id', userId)
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching teams:', error);
        return;
      }

      const loadedTeams: Team[] = (data || []).map(team => ({
        id: team.id,
        admin_id: team.admin_id,
        name: team.name,
        description: team.description,
        created_at: new Date(team.created_at),
        updated_at: new Date(team.updated_at),
      }));

      console.log('Loaded teams:', loadedTeams.length);
      setTeams(loadedTeams);
    } catch (error) {
      console.error('Error in refreshTeams:', error);
    }
  }, [userId]);

  // Refresh players
  const refreshPlayers = useCallback(async () => {
    if (!userId) return;

    try {
      console.log('Fetching players for admin:', userId);
      
      // Get all player relationships for this admin
      const { data: relationships, error: relError } = await supabase
        .from('admin_player_relationships')
        .select('player_id')
        .eq('admin_id', userId);

      if (relError) {
        console.error('Error fetching relationships:', relError);
        return;
      }

      if (!relationships || relationships.length === 0) {
        console.log('No player relationships found');
        setPlayers([]);
        return;
      }

      const playerIds = relationships.map(rel => rel.player_id);

      // Get profiles for all players
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name, phone_number')
        .in('user_id', playerIds);

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        return;
      }

      const loadedPlayers: Player[] = (profiles || []).map(profile => ({
        id: profile.user_id,
        email: '', // Email not available through RLS
        full_name: profile.full_name || 'Unavngivet',
        phone_number: profile.phone_number || '',
      }));

      console.log('Loaded players:', loadedPlayers.length);
      setPlayers(loadedPlayers);
    } catch (error) {
      console.error('Error in refreshPlayers:', error);
    }
  }, [userId]);

  // Load teams and players on mount
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      await Promise.all([refreshTeams(), refreshPlayers()]);
      setLoading(false);
    };

    loadData();
  }, [userId, refreshTeams, refreshPlayers]);

  // Set selected context and save to AsyncStorage
  const setSelectedContext = async (context: SelectedContext) => {
    console.log('Setting selected context:', context);
    setSelectedContextState(context);
    
    try {
      await AsyncStorage.setItem(SELECTED_CONTEXT_KEY, JSON.stringify(context));
      console.log('Saved selection to AsyncStorage');
    } catch (error) {
      console.error('Error saving selection:', error);
    }
  };

  // Create team
  const createTeam = async (name: string, description?: string): Promise<Team> => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    console.log('Creating team:', name);

    const { data, error } = await supabase
      .from('teams')
      .insert({
        admin_id: userId,
        name,
        description,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating team:', error);
      throw error;
    }

    const newTeam: Team = {
      id: data.id,
      admin_id: data.admin_id,
      name: data.name,
      description: data.description,
      created_at: new Date(data.created_at),
      updated_at: new Date(data.updated_at),
    };

    console.log('Team created:', newTeam.id);
    await refreshTeams();
    return newTeam;
  };

  // Update team
  const updateTeam = async (teamId: string, name: string, description?: string) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    console.log('Updating team:', teamId);

    const { error } = await supabase
      .from('teams')
      .update({
        name,
        description,
        updated_at: new Date().toISOString(),
      })
      .eq('id', teamId)
      .eq('admin_id', userId);

    if (error) {
      console.error('Error updating team:', error);
      throw error;
    }

    console.log('Team updated successfully');
    await refreshTeams();
  };

  // Delete team
  const deleteTeam = async (teamId: string) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    console.log('Deleting team:', teamId);

    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamId)
      .eq('admin_id', userId);

    if (error) {
      console.error('Error deleting team:', error);
      throw error;
    }

    console.log('Team deleted successfully');
    
    // If the deleted team was selected, clear selection
    if (selectedContext.type === 'team' && selectedContext.id === teamId) {
      await setSelectedContext({ type: null, id: null, name: null });
    }
    
    await refreshTeams();
  };

  // Add player to team
  const addPlayerToTeam = async (teamId: string, playerId: string) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    console.log('Adding player to team:', { teamId, playerId });

    const { error } = await supabase
      .from('team_members')
      .insert({
        team_id: teamId,
        player_id: playerId,
      });

    if (error) {
      console.error('Error adding player to team:', error);
      throw error;
    }

    console.log('Player added to team successfully');
  };

  // Remove player from team
  const removePlayerFromTeam = async (teamId: string, playerId: string) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    console.log('Removing player from team:', { teamId, playerId });

    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('player_id', playerId);

    if (error) {
      console.error('Error removing player from team:', error);
      throw error;
    }

    console.log('Player removed from team successfully');
  };

  // Get team members
  const getTeamMembers = async (teamId: string): Promise<Player[]> => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    console.log('Fetching team members for team:', teamId);

    const { data: memberData, error: memberError } = await supabase
      .from('team_members')
      .select('player_id')
      .eq('team_id', teamId);

    if (memberError) {
      console.error('Error fetching team members:', memberError);
      throw memberError;
    }

    if (!memberData || memberData.length === 0) {
      return [];
    }

    const playerIds = memberData.map(m => m.player_id);

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, full_name, phone_number')
      .in('user_id', playerIds);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      throw profilesError;
    }

    const members: Player[] = (profiles || []).map(profile => ({
      id: profile.user_id,
      email: '',
      full_name: profile.full_name || 'Unavngivet',
      phone_number: profile.phone_number || '',
    }));

    console.log('Loaded team members:', members.length);
    return members;
  };

  return (
    <TeamPlayerContext.Provider
      value={{
        teams,
        players,
        selectedContext,
        loading,
        setSelectedContext,
        refreshTeams,
        refreshPlayers,
        createTeam,
        updateTeam,
        deleteTeam,
        addPlayerToTeam,
        removePlayerFromTeam,
        getTeamMembers,
      }}
    >
      {children}
    </TeamPlayerContext.Provider>
  );
}

export function useTeamPlayer() {
  const context = useContext(TeamPlayerContext);
  if (context === undefined) {
    throw new Error('useTeamPlayer must be used within a TeamPlayerProvider');
  }
  return context;
}
