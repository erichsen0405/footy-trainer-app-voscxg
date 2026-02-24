import { deleteSingleExternalActivity } from '@/utils/deleteExternalActivities';
import { supabase } from '@/integrations/supabase/client';

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
  },
}));

const supabaseFromMock = supabase.from as jest.Mock;
const getUserMock = supabase.auth.getUser as jest.Mock;

describe('deleteSingleExternalActivity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('soft deletes events_external with deleted_at on success', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const metaMaybeSingle = jest.fn().mockResolvedValue({
      data: { id: 'meta-1', external_event_id: 'event-1' },
      error: null,
    });
    const metaEqUser = jest.fn().mockReturnValue({ maybeSingle: metaMaybeSingle });
    const metaEq = jest.fn().mockReturnValue({ eq: metaEqUser });
    const metaSelect = jest.fn().mockReturnValue({ eq: metaEq });

    const updateSelect = jest.fn().mockResolvedValue({ data: [{ id: 'event-1' }], error: null });
    const updateEq = jest.fn().mockReturnValue({ select: updateSelect });
    const eventsUpdate = jest.fn().mockReturnValue({ eq: updateEq });
    const eventByIdMaybeSingle = jest.fn().mockResolvedValue({ data: { id: 'event-1' }, error: null });
    const eventByIdEq = jest.fn().mockReturnValue({ maybeSingle: eventByIdMaybeSingle });
    const eventsSelect = jest.fn().mockReturnValue({ eq: eventByIdEq });

    supabaseFromMock.mockImplementation((table: string) => {
      if (table === 'events_local_meta') return { select: metaSelect };
      if (table === 'events_external') return { update: eventsUpdate, select: eventsSelect };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await deleteSingleExternalActivity('meta-1');

    expect(result).toEqual({ success: true });
    expect(eventsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        deleted: true,
        deleted_at: expect.any(String),
      })
    );
    expect(updateEq).toHaveBeenCalledWith('id', 'event-1');
    expect(updateSelect).toHaveBeenCalledWith('id');
  });

  it('returns error when events_external soft delete fails', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const metaMaybeSingle = jest.fn().mockResolvedValue({
      data: { id: 'meta-1', external_event_id: 'event-1' },
      error: null,
    });
    const metaEqUser = jest.fn().mockReturnValue({ maybeSingle: metaMaybeSingle });
    const metaEq = jest.fn().mockReturnValue({ eq: metaEqUser });
    const metaSelect = jest.fn().mockReturnValue({ eq: metaEq });

    const updateSelect = jest.fn().mockResolvedValue({ data: null, error: { message: 'delete failed' } });
    const updateEq = jest.fn().mockReturnValue({ select: updateSelect });
    const eventsUpdate = jest.fn().mockReturnValue({ eq: updateEq });
    const eventByIdMaybeSingle = jest.fn().mockResolvedValue({ data: { id: 'event-1' }, error: null });
    const eventByIdEq = jest.fn().mockReturnValue({ maybeSingle: eventByIdMaybeSingle });
    const eventsSelect = jest.fn().mockReturnValue({ eq: eventByIdEq });

    supabaseFromMock.mockImplementation((table: string) => {
      if (table === 'events_local_meta') return { select: metaSelect };
      if (table === 'events_external') return { update: eventsUpdate, select: eventsSelect };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await deleteSingleExternalActivity('meta-1');

    expect(eventsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        deleted: true,
        deleted_at: expect.any(String),
      })
    );
    expect(result).toEqual({
      success: false,
      error: 'delete failed',
    });
  });

  it('returns error when soft delete updates zero rows', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const metaMaybeSingle = jest.fn().mockResolvedValue({
      data: { id: 'meta-1', external_event_id: 'event-1' },
      error: null,
    });
    const metaEqUser = jest.fn().mockReturnValue({ maybeSingle: metaMaybeSingle });
    const metaEq = jest.fn().mockReturnValue({ eq: metaEqUser });
    const metaSelect = jest.fn().mockReturnValue({ eq: metaEq });

    const updateSelect = jest.fn().mockResolvedValue({ data: [], error: null });
    const updateEq = jest.fn().mockReturnValue({ select: updateSelect });
    const eventsUpdate = jest.fn().mockReturnValue({ eq: updateEq });
    const eventByIdMaybeSingle = jest.fn().mockResolvedValue({ data: { id: 'event-1' }, error: null });
    const eventByIdEq = jest.fn().mockReturnValue({ maybeSingle: eventByIdMaybeSingle });
    const eventsSelect = jest.fn().mockReturnValue({ eq: eventByIdEq });

    supabaseFromMock.mockImplementation((table: string) => {
      if (table === 'events_local_meta') return { select: metaSelect };
      if (table === 'events_external') return { update: eventsUpdate, select: eventsSelect };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await deleteSingleExternalActivity('meta-1');

    expect(result).toEqual({
      success: false,
      error: 'Kunne ikke soft-delete ekstern aktivitet (ingen rækker blev opdateret)',
    });
  });

  it('retries without deleted_at_reason when schema cache is missing that column', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const metaMaybeSingle = jest.fn().mockResolvedValue({
      data: { id: 'meta-1', external_event_id: 'event-1' },
      error: null,
    });
    const metaEqUser = jest.fn().mockReturnValue({ maybeSingle: metaMaybeSingle });
    const metaEq = jest.fn().mockReturnValue({ eq: metaEqUser });
    const metaSelect = jest.fn().mockReturnValue({ eq: metaEq });

    const updateSelect = jest.fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: 'PGRST204',
          message: "Could not find the 'deleted_at_reason' column of 'events_external' in the schema cache",
        },
      })
      .mockResolvedValueOnce({ data: [{ id: 'event-1' }], error: null });
    const updateEq = jest.fn().mockReturnValue({ select: updateSelect });
    const eventsUpdate = jest.fn().mockReturnValue({ eq: updateEq });
    const eventByIdMaybeSingle = jest.fn().mockResolvedValue({ data: { id: 'event-1' }, error: null });
    const eventByIdEq = jest.fn().mockReturnValue({ maybeSingle: eventByIdMaybeSingle });
    const eventsSelect = jest.fn().mockReturnValue({ eq: eventByIdEq });

    supabaseFromMock.mockImplementation((table: string) => {
      if (table === 'events_local_meta') return { select: metaSelect };
      if (table === 'events_external') return { update: eventsUpdate, select: eventsSelect };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await deleteSingleExternalActivity('meta-1');

    expect(result).toEqual({ success: true });
    expect(eventsUpdate).toHaveBeenCalledTimes(2);
    expect(eventsUpdate.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        deleted: true,
        deleted_at: expect.any(String),
        deleted_at_reason: 'user-delete',
      })
    );
    expect(eventsUpdate.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        deleted: true,
        deleted_at: expect.any(String),
      })
    );
    expect(eventsUpdate.mock.calls[1][0]).not.toHaveProperty('deleted_at_reason');
    expect(updateSelect).toHaveBeenCalledTimes(2);
  });

  it('falls back to provider_event_uid when external_event_id does not match any row', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const metaMaybeSingle = jest.fn().mockResolvedValue({
      data: { id: 'meta-1', external_event_id: 'legacy-id', external_event_uid: 'uid-1' },
      error: null,
    });
    const metaEqUser = jest.fn().mockReturnValue({ maybeSingle: metaMaybeSingle });
    const metaEq = jest.fn().mockReturnValue({ eq: metaEqUser });
    const metaSelect = jest.fn().mockReturnValue({ eq: metaEq });

    const updateSelect = jest.fn().mockResolvedValue({ data: [{ id: 'event-1' }], error: null });
    const eventsUpdateEq = jest.fn().mockReturnValue({ select: updateSelect });
    const eventsUpdateIn = jest.fn().mockReturnValue({ select: updateSelect });
    const eventsUpdate = jest.fn().mockReturnValue({
      eq: eventsUpdateEq,
      in: eventsUpdateIn,
    });

    const calendarsEq = jest.fn().mockResolvedValue({
      data: [{ id: 'cal-1' }],
      error: null,
    });
    const calendarsSelect = jest.fn().mockReturnValue({ eq: calendarsEq });

    const eventsByUidIn = jest.fn().mockResolvedValue({
      data: [{ id: 'event-1' }],
      error: null,
    });
    const eventByIdMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const eventsByUidEq = jest.fn((column: string) => {
      if (column === 'id') {
        return { maybeSingle: eventByIdMaybeSingle };
      }
      if (column === 'provider_event_uid') {
        return { in: eventsByUidIn };
      }
      throw new Error(`Unexpected events_external eq column ${column}`);
    });
    const eventsByUidSelect = jest.fn().mockReturnValue({ eq: eventsByUidEq });

    supabaseFromMock.mockImplementation((table: string) => {
      if (table === 'events_local_meta') return { select: metaSelect };
      if (table === 'external_calendars') return { select: calendarsSelect };
      if (table === 'events_external') return { update: eventsUpdate, select: eventsByUidSelect };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await deleteSingleExternalActivity('meta-1');

    expect(result).toEqual({ success: true });
    expect(eventsUpdate).toHaveBeenCalledTimes(1);
    expect(eventsUpdateEq).toHaveBeenCalledTimes(0);
    expect(eventsUpdateIn).toHaveBeenCalledTimes(1);
    expect(updateSelect).toHaveBeenCalledTimes(1);
    expect(eventsByUidEq).toHaveBeenCalledWith('provider_event_uid', 'uid-1');
    expect(eventsByUidIn).toHaveBeenCalledWith('provider_calendar_id', ['cal-1']);
  });
});
