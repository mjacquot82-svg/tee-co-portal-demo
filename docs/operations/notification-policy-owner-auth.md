# Notification Policy Owner authentication

Notification Policy administration requires a Supabase Auth user whose
immutable application metadata contains:

```json
{
  "operational_role": "owner"
}
```

The first Owner account must be provisioned by a trusted Supabase project
administrator. Create or select the Owner under **Supabase Dashboard →
Authentication → Users**, then set the user's application metadata
(`app_metadata`, not `user_metadata`) to include the claim above. If the
Dashboard version does not expose application metadata editing, use a trusted
server-side Supabase Admin API process with the project service-role credential.
Never place the service-role credential in the browser or allow the user to
self-assign this claim.

After changing application metadata, the Owner must sign out and sign in again
so Supabase issues a new access token containing the claim.

To open Notification Policy settings:

1. Go to `/admin/settings/notifications/policy`.
2. The application redirects PIN-only sessions to the Owner sign-in page.
3. Enter the provisioned Owner email and password under **Owner Sign In**.
4. After authentication, the application returns to Notification Policy.

Staff PIN authentication remains available for ordinary operational pages but
cannot authorize Notification Policy reads or writes.
