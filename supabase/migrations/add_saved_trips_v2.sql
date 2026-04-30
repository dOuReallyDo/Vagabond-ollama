-- Migration: Add saved_trips_v2 table (multi-step wizard)
-- Created: 2026-04-30

-- =============================================
-- SAVED_TRIPS_V2 (multi-step wizard)
-- =============================================
CREATE TABLE IF NOT EXISTS public.saved_trips_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Trip info
  trip_name TEXT NOT NULL,
  destination TEXT,

  -- Full input & step data (JSONB)
  inputs JSONB NOT NULL DEFAULT '{}',
  step1_data JSONB DEFAULT '{}',   -- ItineraryDraft
  step1_completed BOOLEAN DEFAULT false,
  step2_data JSONB DEFAULT '{}',   -- AccommodationTransport
  step2_completed BOOLEAN DEFAULT false,
  step3_data JSONB DEFAULT '{}',   -- BudgetCalculation
  step3_completed BOOLEAN DEFAULT false,

  -- Flags
  is_complete BOOLEAN DEFAULT false,
  is_favorite BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_saved_trips_v2_user ON public.saved_trips_v2 (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_trips_v2_favorite ON public.saved_trips_v2 (user_id, is_favorite);
CREATE INDEX IF NOT EXISTS idx_saved_trips_v2_incomplete ON public.saved_trips_v2 (user_id) WHERE is_complete = false;

-- RLS policies
ALTER TABLE public.saved_trips_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trips v2"
  ON public.saved_trips_v2 FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trips v2"
  ON public.saved_trips_v2 FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trips v2"
  ON public.saved_trips_v2 FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own trips v2"
  ON public.saved_trips_v2 FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at trigger (reuses existing update_updated_at function)
DROP TRIGGER IF EXISTS set_updated_at ON public.saved_trips_v2;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.saved_trips_v2
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();