"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

/** Anmeldung im Browser. Spricht mit /api/auth auf derselben Seite. */
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});
