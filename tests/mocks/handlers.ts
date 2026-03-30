import { http, HttpResponse } from "msw";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mock.supabase.co";

export const handlers = [
  // Supabase Auth - getUser
  http.get(`${SUPABASE_URL}/auth/v1/user`, () => {
    return HttpResponse.json({
      id: "test-user-id",
      email: "test@example.com",
      app_metadata: {},
      user_metadata: { full_name: "Test User" },
      created_at: new Date().toISOString(),
    });
  }),

  // Supabase Auth - getSession
  http.get(`${SUPABASE_URL}/auth/v1/token`, () => {
    return HttpResponse.json({
      access_token: "mock-access-token",
      refresh_token: "mock-refresh-token",
      expires_in: 3600,
      token_type: "bearer",
      user: {
        id: "test-user-id",
        email: "test@example.com",
      },
    });
  }),

  // Supabase REST - profiles
  http.get(`${SUPABASE_URL}/rest/v1/profiles`, () => {
    return HttpResponse.json([
      {
        id: "test-user-id",
        full_name: "Test User",
        email: "test@example.com",
        avatar_url: null,
      },
    ]);
  }),

  // Supabase REST - children
  http.get(`${SUPABASE_URL}/rest/v1/children`, () => {
    return HttpResponse.json([
      {
        id: "child-1",
        full_name: "Bernardo",
        birth_date: "2020-01-15",
        group_id: "group-1",
      },
    ]);
  }),

  // Supabase REST - documents
  http.get(`${SUPABASE_URL}/rest/v1/documents`, () => {
    return HttpResponse.json([]);
  }),

  // Supabase REST - generic POST (inserts)
  http.post(`${SUPABASE_URL}/rest/v1/:table`, () => {
    return HttpResponse.json({}, { status: 201 });
  }),

  // Supabase REST - generic PATCH (updates)
  http.patch(`${SUPABASE_URL}/rest/v1/:table`, () => {
    return HttpResponse.json({});
  }),

  // Supabase REST - generic DELETE
  http.delete(`${SUPABASE_URL}/rest/v1/:table`, () => {
    return HttpResponse.json({});
  }),
];
