import { z } from "zod";
import { text } from "../schemas.js";
const upload = {
  filename: z
    .string()
    .min(1)
    .max(150)
    .regex(/^[a-zA-Z0-9_. -]+$/),
  contentBase64: z
    .string()
    .min(4)
    .max(2800000)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  title: text(150),
};
export const operationSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("investigate"),
      input: z
        .object({
          provider: z.enum(["fireworks", "nebius", "openai"]),
          rescueIds: z.array(text()).min(1).max(50).optional(),
          usePinecone: z.boolean().optional(),
          trace: z.boolean().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("policy_index"),
      input: z.object({ referenceIds: z.array(text()).min(1).max(5) }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("policy_search"),
      input: z.object({ query: text(500) }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("source_discovery"),
      input: z
        .object({
          provider: z.enum(["tavily", "keenable"]).optional(),
          query: text(500),
          domains: z
            .array(
              z
                .string()
                .min(3)
                .max(100)
                .regex(/^[a-z0-9.-]+\.[a-z]+$/),
            )
            .min(1)
            .max(6),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("preference_recall"),
      input: z.object({ query: text(300) }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("preference_save"),
      input: z
        .object({
          preferenceType: z.enum(["communication_style", "ui_density"]),
          value: z.enum(["concise", "detailed", "comfortable", "compact"]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("preference_forget"),
      input: z.object({ memoryId: text(200) }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("document_upload"),
      input: z
        .object({
          ...upload,
          mimeType: z.enum(["application/pdf", "text/plain"]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("document_poll"),
      input: z.object({ draftId: text() }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("voice_transcribe"),
      input: z
        .object({
          ...upload,
          mimeType: z.enum([
            "audio/mpeg",
            "audio/wav",
            "audio/mp4",
            "audio/webm",
          ]),
        })
        .strict(),
    })
    .strict(),
]);
