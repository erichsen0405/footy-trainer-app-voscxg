
import React, { createContext, useContext, useState, ReactNode } from 'react';

export type AdminMode = 'self' | 'player' | 'team';

export interface AdminContextType {
  adminMode: AdminMode;
  adminTargetId: string | null;
  adminTargetType: 'player' | 'team' | null;
  startAdminPlayer: (playerId: string) => void;
  startAdminTeam: (teamId: string) => void;
  exitAdmin: () => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [adminMode, setAdminMode] = useState<AdminMode>('self');
  const [adminTargetId, setAdminTargetId] = useState<string | null>(null);
  const [adminTargetType, setAdminTargetType] = useState<'player' | 'team' | null>(null);

  const startAdminPlayer = (playerId: string) => {
    console.log('[AdminContext] Starting admin mode for player:', playerId);
    
    // Enforce security rules
    if (!playerId) {
      console.error('[AdminContext] Cannot start admin mode: playerId is required');
      return;
    }

    setAdminMode('player');
    setAdminTargetId(playerId);
    setAdminTargetType('player');
  };

  const startAdminTeam = (teamId: string) => {
    console.log('[AdminContext] Starting admin mode for team:', teamId);
    
    // Enforce security rules
    if (!teamId) {
      console.error('[AdminContext] Cannot start admin mode: teamId is required');
      return;
    }

    setAdminMode('team');
    setAdminTargetId(teamId);
    setAdminTargetType('team');
  };

  const exitAdmin = () => {
    console.log('[AdminContext] Exiting admin mode');
    
    // Reset to self mode
    setAdminMode('self');
    setAdminTargetId(null);
    setAdminTargetType(null);
  };

  // Enforce security rules: validate state consistency
  React.useEffect(() => {
    if (adminMode !== 'self' && !adminTargetId) {
      console.error('[AdminContext] Invalid state: adminMode is not self but adminTargetId is null');
      // Auto-correct to self mode
      exitAdmin();
    }

    if (adminTargetId && adminMode === 'self') {
      console.error('[AdminContext] Invalid state: adminTargetId is set but adminMode is self');
      // Auto-correct to self mode
      exitAdmin();
    }
  }, [adminMode, adminTargetId]);

  return (
    <AdminContext.Provider
      value={{
        adminMode,
        adminTargetId,
        adminTargetType,
        startAdminPlayer,
        startAdminTeam,
        exitAdmin,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
}
