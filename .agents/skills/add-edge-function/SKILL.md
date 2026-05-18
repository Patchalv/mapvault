---
name: add-edge-function
description: Create a new Supabase Edge Function. Use when adding server-side logic that enforces business rules.
---

Create a new Edge Function: $ARGUMENTS

## Steps

1. **Read the technical plan** in `docs/technical-plan.md` for the function's specification and requirements
2. **Read existing Edge Functions** in `supabase/functions/` for patterns and conventions
3. **Create the function** at `supabase/functions/$ARGUMENTS/index.ts`
4. **Follow this structure:**

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  // CORS headers
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    // Auth validation — extract user from Bearer token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Function logic here
    // Use service role client for operations that bypass RLS:
    // const adminClient = createClient(
    //   Deno.env.get("SUPABASE_URL")!,
    //   Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    // );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

5. **Return proper HTTP status codes** and JSON error messages
6. **Test locally** with `supabase functions serve`

## Rules

- Always validate the auth token before processing
- Use service role key only for operations that must bypass RLS
- Never expose internal error details to the client
- All environment variables come from Supabase project settings (never hardcoded)
