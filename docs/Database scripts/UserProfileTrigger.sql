-- ===============================================================================================
-- USER PROFILE AUTO-CREATION TRIGGER
-- ===============================================================================================
-- Automatically creates UserProfiles record when a new auth.users record is created
-- This ensures profile always exists after authentication
-- ===============================================================================================

-- Function to handle new user creation and updates
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public."UserProfiles" ("Id", "Email", "FirstName", "LastName", "AvatarUrl")
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture',
      NEW.raw_user_meta_data->>'image'
    )
  )
  ON CONFLICT ("Id") DO UPDATE SET
    "Email" = COALESCE(NEW.email, EXCLUDED."Email"),
    "FirstName" = COALESCE(NEW.raw_user_meta_data->>'first_name', EXCLUDED."FirstName"),
    "LastName" = COALESCE(NEW.raw_user_meta_data->>'last_name', EXCLUDED."LastName"),
    "AvatarUrl" = COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture',
      NEW.raw_user_meta_data->>'image',
      EXCLUDED."AvatarUrl"
    ),
    "LastLoginAt" = NOW(),
    "UpdatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call function on new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to sync profile on user update (for avatar updates, etc.)
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data OR OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.handle_new_user();

-- ===============================================================================================
-- ROW LEVEL SECURITY POLICIES
-- ===============================================================================================
-- Ensure users can only access their own data
-- ===============================================================================================

-- Enable RLS on all user tables
ALTER TABLE public."UserProfiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserBuyerPreferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserLikedProperties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserSavedListings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserSavedSearches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserViewingHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserNotifications" ENABLE ROW LEVEL SECURITY;

-- UserProfiles policies
DROP POLICY IF EXISTS "Users can view own profile" ON public."UserProfiles";
CREATE POLICY "Users can view own profile"
  ON public."UserProfiles"
  FOR SELECT
  USING (auth.uid() = "Id");

DROP POLICY IF EXISTS "Users can update own profile" ON public."UserProfiles";
CREATE POLICY "Users can update own profile"
  ON public."UserProfiles"
  FOR UPDATE
  USING (auth.uid() = "Id");

-- UserBuyerPreferences policies
DROP POLICY IF EXISTS "Users can view own preferences" ON public."UserBuyerPreferences";
CREATE POLICY "Users can view own preferences"
  ON public."UserBuyerPreferences"
  FOR SELECT
  USING (auth.uid() = "UserId");

DROP POLICY IF EXISTS "Users can insert own preferences" ON public."UserBuyerPreferences";
CREATE POLICY "Users can insert own preferences"
  ON public."UserBuyerPreferences"
  FOR INSERT
  WITH CHECK (auth.uid() = "UserId");

DROP POLICY IF EXISTS "Users can update own preferences" ON public."UserBuyerPreferences";
CREATE POLICY "Users can update own preferences"
  ON public."UserBuyerPreferences"
  FOR UPDATE
  USING (auth.uid() = "UserId");

-- UserLikedProperties policies
DROP POLICY IF EXISTS "Users can view own likes" ON public."UserLikedProperties";
CREATE POLICY "Users can view own likes"
  ON public."UserLikedProperties"
  FOR SELECT
  USING (auth.uid() = "UserId");

DROP POLICY IF EXISTS "Users can insert own likes" ON public."UserLikedProperties";
CREATE POLICY "Users can insert own likes"
  ON public."UserLikedProperties"
  FOR INSERT
  WITH CHECK (auth.uid() = "UserId");

DROP POLICY IF EXISTS "Users can delete own likes" ON public."UserLikedProperties";
CREATE POLICY "Users can delete own likes"
  ON public."UserLikedProperties"
  FOR DELETE
  USING (auth.uid() = "UserId");

-- UserSavedListings policies
DROP POLICY IF EXISTS "Users can view own saved listings" ON public."UserSavedListings";
CREATE POLICY "Users can view own saved listings"
  ON public."UserSavedListings"
  FOR SELECT
  USING (auth.uid() = "UserId");

DROP POLICY IF EXISTS "Users can insert own saved listings" ON public."UserSavedListings";
CREATE POLICY "Users can insert own saved listings"
  ON public."UserSavedListings"
  FOR INSERT
  WITH CHECK (auth.uid() = "UserId");

DROP POLICY IF EXISTS "Users can update own saved listings" ON public."UserSavedListings";
CREATE POLICY "Users can update own saved listings"
  ON public."UserSavedListings"
  FOR UPDATE
  USING (auth.uid() = "UserId");

DROP POLICY IF EXISTS "Users can delete own saved listings" ON public."UserSavedListings";
CREATE POLICY "Users can delete own saved listings"
  ON public."UserSavedListings"
  FOR DELETE
  USING (auth.uid() = "UserId");

-- UserSavedSearches policies
DROP POLICY IF EXISTS "Users can view own saved searches" ON public."UserSavedSearches";
CREATE POLICY "Users can view own saved searches"
  ON public."UserSavedSearches"
  FOR SELECT
  USING (auth.uid() = "UserId");

DROP POLICY IF EXISTS "Users can insert own saved searches" ON public."UserSavedSearches";
CREATE POLICY "Users can insert own saved searches"
  ON public."UserSavedSearches"
  FOR INSERT
  WITH CHECK (auth.uid() = "UserId");

DROP POLICY IF EXISTS "Users can update own saved searches" ON public."UserSavedSearches";
CREATE POLICY "Users can update own saved searches"
  ON public."UserSavedSearches"
  FOR UPDATE
  USING (auth.uid() = "UserId");

DROP POLICY IF EXISTS "Users can delete own saved searches" ON public."UserSavedSearches";
CREATE POLICY "Users can delete own saved searches"
  ON public."UserSavedSearches"
  FOR DELETE
  USING (auth.uid() = "UserId");

-- UserViewingHistory policies
DROP POLICY IF EXISTS "Users can view own viewing history" ON public."UserViewingHistory";
CREATE POLICY "Users can view own viewing history"
  ON public."UserViewingHistory"
  FOR SELECT
  USING (auth.uid() = "UserId");

DROP POLICY IF EXISTS "Users can insert own viewing history" ON public."UserViewingHistory";
CREATE POLICY "Users can insert own viewing history"
  ON public."UserViewingHistory"
  FOR INSERT
  WITH CHECK (auth.uid() = "UserId");

DROP POLICY IF EXISTS "Users can update own viewing history" ON public."UserViewingHistory";
CREATE POLICY "Users can update own viewing history"
  ON public."UserViewingHistory"
  FOR UPDATE
  USING (auth.uid() = "UserId");

DROP POLICY IF EXISTS "Users can delete own viewing history" ON public."UserViewingHistory";
CREATE POLICY "Users can delete own viewing history"
  ON public."UserViewingHistory"
  FOR DELETE
  USING (auth.uid() = "UserId");

-- UserNotifications policies
DROP POLICY IF EXISTS "Users can view own notifications" ON public."UserNotifications";
CREATE POLICY "Users can view own notifications"
  ON public."UserNotifications"
  FOR SELECT
  USING (auth.uid() = "UserId");

DROP POLICY IF EXISTS "Users can update own notifications" ON public."UserNotifications";
CREATE POLICY "Users can update own notifications"
  ON public."UserNotifications"
  FOR UPDATE
  USING (auth.uid() = "UserId");

DROP POLICY IF EXISTS "Users can delete own notifications" ON public."UserNotifications";
CREATE POLICY "Users can delete own notifications"
  ON public."UserNotifications"
  FOR DELETE
  USING (auth.uid() = "UserId");

