import type { MemberRole } from "./db/schema";

export type AppEnv = {
  Bindings: Env;
  Variables: {
    userId?: string;
    role?: MemberRole;
  };
};
