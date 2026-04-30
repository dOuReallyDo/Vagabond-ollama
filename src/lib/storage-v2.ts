import type { TravelInputs } from "../shared/contract";
import type { ItineraryDraft } from "../shared/step1-contract";
import type { AccommodationTransport } from "../shared/step2-contract";
import type { BudgetCalculation } from "../shared/step3-contract";

// =============================================
// SavedTripV2 — matches saved_trips_v2 DB table
// =============================================

export interface SavedTripV2 {
  id: string;
  user_id: string;
  trip_name: string;
  destination: string | null;
  inputs: TravelInputs;
  step1_data: ItineraryDraft | null;
  step1_completed: boolean;
  step2_data: AccommodationTransport | null;
  step2_completed: boolean;
  step3_data: BudgetCalculation | null;
  step3_completed: boolean;
  is_complete: boolean;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================
// Constants
// =============================================

const LOCAL_STORAGE_KEY = "vagabond_saved_trips_v2_local";

// =============================================
// Auth token helper — reads JWT from localStorage (same pattern as storage.ts)
// =============================================

/** Read access token directly from localStorage — avoids Supabase client's initializePromise hang */
function getAccessTokenFromLocalStorage(): string | null {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const projectRef = supabaseUrl.split("//")[1].split(".")[0];
    const sessionKey = `sb-${projectRef}-auth-token`;
    const raw = localStorage.getItem(sessionKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.access_token || parsed?.currentSession?.access_token || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

// =============================================
// REST API helpers
// =============================================

const supabaseUrl = () => import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = () => import.meta.env.VITE_SUPABASE_ANON_KEY;

function restHeaders(accessToken: string): Record<string, string> {
  return {
    apikey: supabaseAnonKey(),
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

const TABLE_URL = () => `${supabaseUrl()}/rest/v1/saved_trips_v2`;

// =============================================
// Local storage helpers
// =============================================

function loadLocalTrips(): SavedTripV2[] {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    /* ignore */
  }
  return [];
}

function saveLocalTrips(trips: SavedTripV2[]): void {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(trips));
}

// =============================================
// createTripV2 — Creates a new trip with inputs
// =============================================

/**
 * Creates a new v2 trip.
 * 1. POSTs to Supabase REST API if authenticated (returns the full row).
 * 2. Falls back to localStorage (generates a UUID client-side).
 */
export async function createTripV2(
  inputs: TravelInputs,
  userId?: string
): Promise<SavedTripV2> {
  const tripName =
    inputs.destination && inputs.country
      ? `${inputs.destination}, ${inputs.country}`
      : inputs.destination || "Viaggio senza nome";

  const destination = inputs.destination || null;

  // Build the local-first trip object
  const newTrip: SavedTripV2 = {
    id: crypto.randomUUID(),
    user_id: userId || "",
    trip_name: tripName,
    destination,
    inputs,
    step1_data: null,
    step1_completed: false,
    step2_data: null,
    step2_completed: false,
    step3_data: null,
    step3_completed: false,
    is_complete: false,
    is_favorite: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (userId) {
    const accessToken = getAccessTokenFromLocalStorage();

    if (accessToken) {
      try {
        console.log("[CreateTripV2] Using REST API, user:", userId);

        const response = await fetch(TABLE_URL(), {
          method: "POST",
          headers: {
            ...restHeaders(accessToken),
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            user_id: userId,
            trip_name: tripName,
            destination,
            inputs,
            step1_data: null,
            step1_completed: false,
            step2_data: null,
            step2_completed: false,
            step3_data: null,
            step3_completed: false,
            is_complete: false,
            is_favorite: false,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          // PostgREST with return=representation returns an array
          const saved = Array.isArray(data) ? data[0] : data;

          // Also persist to localStorage for offline access
          const localTrips = loadLocalTrips();
          localTrips.unshift(saved as SavedTripV2);
          saveLocalTrips(localTrips);

          console.log("[CreateTripV2] Saved to Supabase, id:", saved.id);
          return saved as SavedTripV2;
        } else {
          const errBody = await response.text();
          console.warn("[CreateTripV2] REST error:", response.status, errBody);
        }
      } catch (err) {
        console.error("[CreateTripV2] REST failed, falling back to localStorage:", err);
      }
    } else {
      console.warn("[CreateTripV2] No access token — using localStorage");
    }
  }

  // Fallback: save to localStorage only
  const localTrips = loadLocalTrips();
  localTrips.unshift(newTrip);
  saveLocalTrips(localTrips);
  console.log("[CreateTripV2] Saved to localStorage, id:", newTrip.id);
  return newTrip;
}

// =============================================
// saveStep — Saves data for a specific step (1, 2, or 3)
// =============================================

/**
 * Saves step data and marks that step as completed.
 * Uses PATCH to update only the relevant columns.
 * Also updates localStorage for offline consistency.
 */
export async function saveStep(
  tripId: string,
  stepNumber: 1 | 2 | 3,
  data: ItineraryDraft | AccommodationTransport | BudgetCalculation,
  userId?: string
): Promise<void> {
  const stepDataKey = `step${stepNumber}_data` as const;
  const stepCompletedKey = `step${stepNumber}_completed` as const;

  const patchPayload: Record<string, unknown> = {
    [stepDataKey]: data,
    [stepCompletedKey]: true,
  };

  // If step 3 is being saved, also check if all steps complete → mark trip complete
  if (stepNumber === 3) {
    // We'll set is_complete after confirming all steps, but we optimistically
    // set it in the PATCH since step3 is the last step
    patchPayload.is_complete = true;
  }

  // Always update localStorage first (instant, works offline)
  const localTrips = loadLocalTrips();
  const localIdx = localTrips.findIndex((t) => t.id === tripId);
  if (localIdx >= 0) {
    const trip = localTrips[localIdx];
    (trip as any)[stepDataKey] = data;
    (trip as any)[stepCompletedKey] = true;
    trip.updated_at = new Date().toISOString();
    // Mark complete if step 3 saved
    if (stepNumber === 3) {
      trip.is_complete = true;
    }
    saveLocalTrips(localTrips);
  }

  // Try Supabase
  if (userId) {
    const accessToken = getAccessTokenFromLocalStorage();

    if (accessToken) {
      try {
        console.log(`[SaveStep] PATCH step${stepNumber} for trip ${tripId}`);

        const response = await fetch(`${TABLE_URL()}?id=eq.${tripId}`, {
          method: "PATCH",
          headers: restHeaders(accessToken),
          body: JSON.stringify(patchPayload),
        });

        if (!response.ok) {
          const errBody = await response.text();
          console.error(`[SaveStep] REST error:`, response.status, errBody);
        } else {
          console.log(`[SaveStep] Step ${stepNumber} saved to Supabase`);
        }
      } catch (err) {
        console.error("[SaveStep] REST failed:", err);
      }
    }
  }
}

// =============================================
// invalidateStepsAfter — Clears subsequent step data
// =============================================

/**
 * When an earlier step is modified, later steps must be invalidated.
 * E.g., if Step 1 changes → clear step2_data, step3_data and reset their completed flags.
 *
 * afterStep = 1 → clears step 2 & 3
 * afterStep = 2 → clears step 3
 * afterStep = 3 → no-op
 */
export async function invalidateStepsAfter(
  tripId: string,
  afterStep: 1 | 2,
  userId?: string
): Promise<void> {
  const patchPayload: Record<string, unknown> = {
    is_complete: false,
  };

  if (afterStep === 1) {
    patchPayload.step2_data = null;
    patchPayload.step2_completed = false;
    patchPayload.step3_data = null;
    patchPayload.step3_completed = false;
  } else if (afterStep === 2) {
    patchPayload.step3_data = null;
    patchPayload.step3_completed = false;
  }

  // Update localStorage
  const localTrips = loadLocalTrips();
  const localIdx = localTrips.findIndex((t) => t.id === tripId);
  if (localIdx >= 0) {
    const trip = localTrips[localIdx];
    trip.is_complete = false;

    if (afterStep === 1) {
      trip.step2_data = null;
      trip.step2_completed = false;
      trip.step3_data = null;
      trip.step3_completed = false;
    } else if (afterStep === 2) {
      trip.step3_data = null;
      trip.step3_completed = false;
    }

    trip.updated_at = new Date().toISOString();
    saveLocalTrips(localTrips);
  }

  // Try Supabase
  if (userId) {
    const accessToken = getAccessTokenFromLocalStorage();

    if (accessToken) {
      try {
        console.log(`[InvalidateSteps] Clearing steps after ${afterStep} for trip ${tripId}`);

        const response = await fetch(`${TABLE_URL()}?id=eq.${tripId}`, {
          method: "PATCH",
          headers: restHeaders(accessToken),
          body: JSON.stringify(patchPayload),
        });

        if (!response.ok) {
          const errBody = await response.text();
          console.error("[InvalidateSteps] REST error:", response.status, errBody);
        } else {
          console.log("[InvalidateSteps] Steps cleared in Supabase");
        }
      } catch (err) {
        console.error("[InvalidateSteps] REST failed:", err);
      }
    }
  }
}

// =============================================
// loadTripsV2 — Loads all v2 trips for user
// =============================================

/**
 * Load saved v2 trips: merge Supabase + localStorage for logged-in users,
 * localStorage only for guests.
 */
export async function loadTripsV2(userId?: string): Promise<SavedTripV2[]> {
  // Always load localStorage first (instant, works offline)
  let localTrips = loadLocalTrips();

  if (userId) {
    const accessToken = getAccessTokenFromLocalStorage();

    if (accessToken) {
      try {
        console.log("[LoadTripsV2] Using REST API, user:", userId);

        const response = await fetch(
          `${TABLE_URL()}?user_id=eq.${userId}&order=updated_at.desc&select=*`,
          {
            method: "GET",
            headers: {
              apikey: supabaseAnonKey(),
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            // Merge: Supabase trips + local trips that aren't in Supabase yet
            const supabaseIds = new Set(data.map((t: any) => t.id));
            const localOnly = localTrips.filter((lt) => !supabaseIds.has(lt.id));
            console.log(
              "[LoadTripsV2] REST loaded",
              data.length,
              "Supabase trips +",
              localOnly.length,
              "local-only"
            );
            // Replace localStorage with Supabase data to keep it fresh
            saveLocalTrips([...(data as SavedTripV2[]), ...localOnly]);
            return [...(data as SavedTripV2[]), ...localOnly];
          }
          console.log("[LoadTripsV2] REST returned 0 trips for user");
        } else {
          const errBody = await response.text();
          console.warn("[LoadTripsV2] REST error:", response.status, errBody, "— falling back to localStorage");
        }
      } catch (err) {
        console.error("[LoadTripsV2] Error:", err, "— falling back to localStorage");
      }
    } else {
      console.warn("[LoadTripsV2] No access token — using localStorage only");
    }
  }

  return localTrips;
}

// =============================================
// loadTripV2 — Load single trip by ID
// =============================================

/**
 * Loads a single v2 trip by ID.
 * Tries Supabase REST API first if userId is provided, then falls back to localStorage.
 */
export async function loadTripV2(
  tripId: string,
  userId?: string
): Promise<SavedTripV2 | null> {
  if (userId) {
    const accessToken = getAccessTokenFromLocalStorage();

    if (accessToken) {
      try {
        const response = await fetch(
          `${TABLE_URL()}?id=eq.${tripId}&select=*`,
          {
            method: "GET",
            headers: {
              apikey: supabaseAnonKey(),
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            return data[0] as SavedTripV2;
          }
          // No matching trip — user may not own it
          return null;
        }
      } catch (err) {
        console.error("[LoadTripV2] REST error:", err);
      }
    }
  }

  // Fallback: search localStorage
  const localTrips = loadLocalTrips();
  return localTrips.find((t) => t.id === tripId) || null;
}

// =============================================
// deleteTripV2 — Delete a v2 trip
// =============================================

/**
 * Deletes a v2 trip from both Supabase and localStorage.
 */
export async function deleteTripV2(tripId: string, userId?: string): Promise<void> {
  // Remove from localStorage
  const localTrips = loadLocalTrips();
  const filtered = localTrips.filter((t) => t.id !== tripId);
  saveLocalTrips(filtered);

  // Remove from Supabase
  if (userId) {
    const accessToken = getAccessTokenFromLocalStorage();

    if (accessToken) {
      try {
        console.log("[DeleteTripV2] Deleting trip", tripId);

        const response = await fetch(`${TABLE_URL()}?id=eq.${tripId}`, {
          method: "DELETE",
          headers: {
            apikey: supabaseAnonKey(),
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          const errBody = await response.text();
          console.error("[DeleteTripV2] REST error:", response.status, errBody);
        } else {
          console.log("[DeleteTripV2] Deleted from Supabase");
        }
      } catch (err) {
        console.error("[DeleteTripV2] REST failed:", err);
      }
    }
  }
}

// =============================================
// toggleFavoriteV2 — Toggle favorite flag
// =============================================

/**
 * Toggles the is_favorite flag on a v2 trip.
 */
export async function toggleFavoriteV2(
  tripId: string,
  isFavorite: boolean,
  userId?: string
): Promise<void> {
  // Update localStorage
  const localTrips = loadLocalTrips();
  const idx = localTrips.findIndex((t) => t.id === tripId);
  if (idx >= 0) {
    localTrips[idx].is_favorite = isFavorite;
    localTrips[idx].updated_at = new Date().toISOString();
    saveLocalTrips(localTrips);
  }

  // Update Supabase
  if (userId) {
    const accessToken = getAccessTokenFromLocalStorage();

    if (accessToken) {
      try {
        const response = await fetch(`${TABLE_URL()}?id=eq.${tripId}`, {
          method: "PATCH",
          headers: restHeaders(accessToken),
          body: JSON.stringify({ is_favorite: isFavorite }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          console.error("[ToggleFavoriteV2] REST error:", response.status, errBody);
        }
      } catch (err) {
        console.error("[ToggleFavoriteV2] REST failed:", err);
      }
    }
  }
}

// =============================================
// markComplete — Mark trip as complete
// =============================================

/**
 * Marks a trip as is_complete=true. Should be called when all 3 steps are done.
 */
export async function markComplete(tripId: string, userId?: string): Promise<void> {
  // Update localStorage
  const localTrips = loadLocalTrips();
  const idx = localTrips.findIndex((t) => t.id === tripId);
  if (idx >= 0) {
    localTrips[idx].is_complete = true;
    localTrips[idx].updated_at = new Date().toISOString();
    saveLocalTrips(localTrips);
  }

  // Update Supabase
  if (userId) {
    const accessToken = getAccessTokenFromLocalStorage();

    if (accessToken) {
      try {
        console.log("[MarkComplete] Marking trip", tripId, "as complete");

        const response = await fetch(`${TABLE_URL()}?id=eq.${tripId}`, {
          method: "PATCH",
          headers: restHeaders(accessToken),
          body: JSON.stringify({ is_complete: true }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          console.error("[MarkComplete] REST error:", response.status, errBody);
        } else {
          console.log("[MarkComplete] Trip marked complete in Supabase");
        }
      } catch (err) {
        console.error("[MarkComplete] REST failed:", err);
      }
    }
  }
}

// =============================================
// migrateLocalTripsV2ToSupabase — Migrate localStorage trips to Supabase (call after login)
// =============================================

/**
 * Pushes any v2 trips stored in localStorage to Supabase for the given user.
 * After successful migration, clears the local store.
 */
export async function migrateLocalTripsV2ToSupabase(userId: string): Promise<void> {
  const localTrips = loadLocalTrips();
  if (localTrips.length === 0) return;

  const accessToken = getAccessTokenFromLocalStorage();
  if (!accessToken) {
    console.warn("[MigrateV2] No access token — skipping migration");
    return;
  }

  let migrated = 0;
  for (const trip of localTrips) {
    try {
      const response = await fetch(TABLE_URL(), {
        method: "POST",
        headers: {
          ...restHeaders(accessToken),
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          user_id: userId,
          trip_name: trip.trip_name,
          destination: trip.destination,
          inputs: trip.inputs,
          step1_data: trip.step1_data,
          step1_completed: trip.step1_completed,
          step2_data: trip.step2_data,
          step2_completed: trip.step2_completed,
          step3_data: trip.step3_data,
          step3_completed: trip.step3_completed,
          is_complete: trip.is_complete,
          is_favorite: trip.is_favorite,
        }),
      });

      if (response.ok) {
        migrated++;
      } else {
        const errBody = await response.text();
        console.error("[MigrateV2] Error migrating trip:", response.status, errBody);
      }
    } catch (err) {
      console.error("[MigrateV2] Error migrating trip:", err);
    }
  }

  console.log(`[MigrateV2] Migrated ${migrated}/${localTrips.length} trips`);

  // Clear localStorage after successful migration
  if (migrated > 0) {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  }
}