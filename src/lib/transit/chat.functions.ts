import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { respond, type Context } from "./engine";

export const sendChat = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ message: z.string().min(1).max(1000), context: z.record(z.any()).default({}) })
      .parse(d),
  )
  .handler(async ({ data }) => respond(data.message, data.context as Context));
