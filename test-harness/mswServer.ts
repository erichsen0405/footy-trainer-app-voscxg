import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { handleSupabaseTable } from './scenarios';

const SUPABASE_REST_ROUTE = '*/rest/v1/:table';

export const mockApiServer = setupServer(
  rest.get(SUPABASE_REST_ROUTE, (req, res, ctx) => {
    const table = String(req.params.table ?? '');
    const payload = handleSupabaseTable(req, table);
    if (payload === null) {
      return res(ctx.status(500), ctx.json({ message: `Unhandled GET table mock: ${table}` }));
    }
    return res(ctx.status(200), ctx.json(payload));
  }),
  rest.post(SUPABASE_REST_ROUTE, (req, res, ctx) => {
    const table = String(req.params.table ?? '');
    const payload = handleSupabaseTable(req, table);
    if (payload === null) {
      return res(ctx.status(500), ctx.json({ message: `Unhandled POST table mock: ${table}` }));
    }
    return res(ctx.status(201), ctx.json(payload));
  }),
  rest.patch(SUPABASE_REST_ROUTE, (req, res, ctx) => {
    const table = String(req.params.table ?? '');
    const payload = handleSupabaseTable(req, table);
    if (payload === null) {
      return res(ctx.status(500), ctx.json({ message: `Unhandled PATCH table mock: ${table}` }));
    }
    return res(ctx.status(200), ctx.json(payload));
  }),
  rest.delete(SUPABASE_REST_ROUTE, (req, res, ctx) => {
    const table = String(req.params.table ?? '');
    const payload = handleSupabaseTable(req, table);
    if (payload === null) {
      return res(ctx.status(500), ctx.json({ message: `Unhandled DELETE table mock: ${table}` }));
    }
    return res(ctx.status(200), ctx.json(payload));
  })
);
