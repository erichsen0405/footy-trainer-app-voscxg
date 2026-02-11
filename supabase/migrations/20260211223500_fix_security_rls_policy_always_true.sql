-- Issue #149 security lint fix
-- Ensure UPDATE policies do not use WITH CHECK true.

DROP POLICY IF EXISTS mp_events_local_meta_update_4c9184f3 ON public.events_local_meta;
CREATE POLICY mp_events_local_meta_update_4c9184f3
ON public.events_local_meta
FOR UPDATE
TO public
USING (
  (
    ((SELECT auth.uid()) = user_id)
    OR ((SELECT auth.uid()) = player_id)
    OR (team_id IN (
      SELECT team_members.team_id
      FROM public.team_members
      WHERE team_members.player_id = (SELECT auth.uid())
    ))
    OR (user_id IN (
      SELECT admin_player_relationships.player_id
      FROM public.admin_player_relationships
      WHERE admin_player_relationships.admin_id = (SELECT auth.uid())
    ))
  )
)
WITH CHECK (
  (
    ((SELECT auth.uid()) = user_id)
    OR ((SELECT auth.uid()) = player_id)
    OR (team_id IN (
      SELECT team_members.team_id
      FROM public.team_members
      WHERE team_members.player_id = (SELECT auth.uid())
    ))
    OR (user_id IN (
      SELECT admin_player_relationships.player_id
      FROM public.admin_player_relationships
      WHERE admin_player_relationships.admin_id = (SELECT auth.uid())
    ))
  )
);

DROP POLICY IF EXISTS mp_external_event_tasks_update_4c9184f3 ON public.external_event_tasks;
CREATE POLICY mp_external_event_tasks_update_4c9184f3
ON public.external_event_tasks
FOR UPDATE
TO public
USING (
  (
    (local_meta_id IN (
      SELECT events_local_meta.id
      FROM public.events_local_meta
      WHERE events_local_meta.user_id IN (
        SELECT admin_player_relationships.player_id
        FROM public.admin_player_relationships
        WHERE admin_player_relationships.admin_id = (SELECT auth.uid())
      )
    ))
    OR (local_meta_id IN (
      SELECT events_local_meta.id
      FROM public.events_local_meta
      WHERE events_local_meta.user_id = (SELECT auth.uid())
    ))
  )
)
WITH CHECK (
  (
    (local_meta_id IN (
      SELECT events_local_meta.id
      FROM public.events_local_meta
      WHERE events_local_meta.user_id IN (
        SELECT admin_player_relationships.player_id
        FROM public.admin_player_relationships
        WHERE admin_player_relationships.admin_id = (SELECT auth.uid())
      )
    ))
    OR (local_meta_id IN (
      SELECT events_local_meta.id
      FROM public.events_local_meta
      WHERE events_local_meta.user_id = (SELECT auth.uid())
    ))
  )
);

DROP POLICY IF EXISTS mp_player_invitations_update_4c9184f3 ON public.player_invitations;
CREATE POLICY mp_player_invitations_update_4c9184f3
ON public.player_invitations
FOR UPDATE
TO public
USING (
  (
    (admin_id = (SELECT auth.uid()))
    OR ((status = 'pending'::text) AND (invitation_code IS NOT NULL))
  )
)
WITH CHECK (
  (
    (admin_id = (SELECT auth.uid()))
    OR ((status = 'pending'::text) AND (invitation_code IS NOT NULL))
  )
);