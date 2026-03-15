
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Team {
  id: string;
  admin_id: string;
  name: string;
  description?: string | null;
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
  ensureRosterLoaded: (force?: boolean) => Promise<{ teams: Team[]; players: Player[] }>;
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
const toDateOrNow = (value: string | null | undefined): Date => (value ? new Date(value) : new Date());

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
  const rosterLoadedRef = React.useRef(false);
  const rosterLoadRequestIdRef = React.useRef(0);
  const rosterLoadPromiseRef = React.useRef<Promise<{ teams: Team[]; players: Player[] }> | null>(null);

  // Keep userId in sync with auth state (initial load + sign in/out)
  useEffect(() => {
    let mounted = true;

    const syncCurrentUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!mounted) return;
      console.log('TeamPlayerContext - Current user:', user?.id);
      setUserId(user?.id || null);
    };

    syncCurrentUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id || null;
      console.log('TeamPlayerContext - Auth state changed:', _event, nextUserId);
      setUserId(nextUserId);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const requireUserId = useCallback(async (): Promise<string> => {
    if (userId) return userId;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user ?? null;

    const resolvedUserId = user?.id || null;
    setUserId(resolvedUserId);
    if (!resolvedUserId) {
      throw new Error('User not authenticated');
    }

    return resolvedUserId;
  }, [userId]);

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

  useEffect(() => {
    rosterLoadedRef.current = false;
    rosterLoadPromiseRef.current = null;
    setTeams([]);
    setPlayers([]);

    setLoading(false);
  }, [userId]);

  const loadTeamsForUser = useCallback(async (resolvedUserId: string): Promise<Team[]> => {
    console.log('Fetching teams for admin:', resolvedUserId);
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('admin_id', resolvedUserId)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching teams:', error);
      throw error;
    }

    const loadedTeams: Team[] = (data || []).map(team => ({
      id: team.id,
      admin_id: team.admin_id,
      name: team.name,
      description: team.description,
      created_at: toDateOrNow(team.created_at),
      updated_at: toDateOrNow(team.updated_at),
    }));

    console.log('Loaded teams:', loadedTeams.length);
    return loadedTeams;
  }, []);

  const loadPlayersForUser = useCallback(async (resolvedUserId: string): Promise<Player[]> => {
    console.log('Fetching players for admin:', resolvedUserId);

    const { data: relationships, error: relError } = await supabase
      .from('admin_player_relationships')
      .select('player_id')
      .eq('admin_id', resolvedUserId);

    if (relError) {
      console.error('Error fetching relationships:', relError);
      throw relError;
    }

    if (!relationships || relationships.length === 0) {
      console.log('No player relationships found');
      return [];
    }

    const playerIds = relationships.map(rel => rel.player_id);

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, full_name, phone_number')
      .in('user_id', playerIds);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      throw profilesError;
    }

    const loadedPlayers: Player[] = (profiles || []).map(profile => ({
      id: profile.user_id,
      email: '',
      full_name: profile.full_name || 'Unavngivet',
      phone_number: profile.phone_number || '',
    }));

    console.log('Loaded players:', loadedPlayers.length);
    return loadedPlayers;
  }, []);

  // Refresh teams
  const refreshTeams = useCallback(async () => {
    if (!userId) {
      setTeams([]);
      return;
    }

    try {
      const loadedTeams = await loadTeamsForUser(userId);
      setTeams(loadedTeams);
    } catch (error) {
      console.error('Error in refreshTeams:', error);
    }
  }, [loadTeamsForUser, userId]);

  // Refresh players
  const refreshPlayers = useCallback(async () => {
    if (!userId) {
      setPlayers([]);
      return;
    }

    try {
      const loadedPlayers = await loadPlayersForUser(userId);
      setPlayers(loadedPlayers);
    } catch (error) {
      console.error('Error in refreshPlayers:', error);
    }
  }, [loadPlayersForUser, userId]);

  const ensureRosterLoaded = useCallback(
    async (force = false): Promise<{ teams: Team[]; players: Player[] }> => {
      if (!userId) {
        setTeams([]);
        setPlayers([]);
        setLoading(false);
        return { teams: [], players: [] };
      }

      if (!force && rosterLoadPromiseRef.current) {
        return rosterLoadPromiseRef.current;
      }

      if (!force && rosterLoadedRef.current) {
        return { teams, players };
      }

      const requestId = rosterLoadRequestIdRef.current + 1;
      rosterLoadRequestIdRef.current = requestId;
      const run = (async () => {
        setLoading(true);
        try {
          const [loadedTeams, loadedPlayers] = await Promise.all([
            loadTeamsForUser(userId),
            loadPlayersForUser(userId),
          ]);
          setTeams(loadedTeams);
          setPlayers(loadedPlayers);
          rosterLoadedRef.current = true;
          return { teams: loadedTeams, players: loadedPlayers };
        } finally {
          setLoading(false);
          if (rosterLoadRequestIdRef.current === requestId) {
            rosterLoadPromiseRef.current = null;
          }
        }
      })();

      rosterLoadPromiseRef.current = run;
      return run;
    },
    [loadPlayersForUser, loadTeamsForUser, players, teams, userId]
  );

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
    const resolvedUserId = await requireUserId();

    console.log('Creating team:', name);

    const { data, error } = await supabase
      .from('teams')
      .insert({
        admin_id: resolvedUserId,
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
      created_at: toDateOrNow(data.created_at),
      updated_at: toDateOrNow(data.updated_at),
    };

    console.log('Team created:', newTeam.id);
    await refreshTeams();
    return newTeam;
  };

  // Update team
  const updateTeam = async (teamId: string, name: string, description?: string) => {
    const resolvedUserId = await requireUserId();

    console.log('Updating team:', teamId);

    const { error } = await supabase
      .from('teams')
      .update({
        name,
        description,
        updated_at: new Date().toISOString(),
      })
      .eq('id', teamId)
      .eq('admin_id', resolvedUserId);

    if (error) {
      console.error('Error updating team:', error);
      throw error;
    }

    console.log('Team updated successfully');
    await refreshTeams();
  };

  // Delete team
  const deleteTeam = async (teamId: string) => {
    const resolvedUserId = await requireUserId();

    console.log('Deleting team:', teamId);

    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamId)
      .eq('admin_id', resolvedUserId);

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
    await requireUserId();

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
    await requireUserId();

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
    await requireUserId();

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
        ensureRosterLoaded,
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
