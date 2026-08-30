"use server";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { revalidatePath } from "next/cache";
import { Pool } from "pg";

import { env } from "@/app/lib/env";
import { deleteAsset, getMuxCapacity } from "@/app/lib/mux";
import * as schema from "@/db/schema";

const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = drizzle(pool, { schema });

export interface StorageCapacity {
  used: number;
  limit: number;
  available: number;
  hasRoom: boolean;
}

/** Current Mux storage usage, shown in the library so the cap is never a surprise. */
export async function getStorageCapacityAction(): Promise<StorageCapacity | null> {
  try {
    return await getMuxCapacity();
  } catch (error) {
    console.error("Failed to read Mux capacity:", error);
    return null;
  }
}

/**
 * Deletes a show and its Mux asset, freeing a storage slot.
 *
 * The Mux asset is removed first: if that fails the row is kept so the asset is
 * never orphaned (invisible in the app but still consuming plan capacity).
 */
export async function deleteShowAction(showId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const show = await db.query.generatedShows.findFirst({
      where: eq(schema.generatedShows.id, showId),
    });
    if (!show) {
      return { ok: false, error: "Show not found." };
    }

    if (show.muxAssetId) {
      await deleteAsset(show.muxAssetId);
    }

    await db.delete(schema.generatedShows).where(eq(schema.generatedShows.id, showId));

    revalidatePath("/media");
    return { ok: true };
  } catch (error) {
    console.error("Failed to delete show:", error);
    const message = error instanceof Error ? error.message : "Failed to delete show.";
    return { ok: false, error: message };
  }
}
