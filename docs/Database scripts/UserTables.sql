/* ===============================================================
   USER BUYER PREFERENCES
   =============================================================== */

create table public."UserBuyerPreferences" (
  "Id" uuid not null default gen_random_uuid(),
  "UserId" uuid not null,
  "FirstTimeBuyer" boolean null,
  "PreApproved" boolean null,
  "HasHouseToSell" boolean null,
  "PurchaseTimeframe" text null,
  "CreatedAt" timestamp with time zone not null default now(),
  "UpdatedAt" timestamp with time zone not null default now(),
  constraint UserBuyerPreferences_pkey primary key ("Id"),
  constraint unique_user_buyer_prefs unique ("UserId"),
  constraint UserBuyerPreferences_UserId_fkey 
    foreign key ("UserId") references auth.users (id) on delete cascade,
  constraint UserBuyerPreferences_PurchaseTimeframe_check check (
    "PurchaseTimeframe" = any (
      array['0-3','3-6','6-12','12+']
    )
  )
);

create index if not exists idx_buyer_prefs_user_id 
  on public."UserBuyerPreferences" ("UserId");

create trigger update_buyer_prefs_updated_at
before update on "UserBuyerPreferences"
for each row execute function update_updated_at_column();


/* ===============================================================
   USER LIKED PROPERTIES
   =============================================================== */

create table public."UserLikedProperties" (
  "Id" uuid not null default gen_random_uuid(),
  "UserId" uuid not null,
  "MlsNumber" text not null,
  "LikedAt" timestamp with time zone not null default now(),
  "CreatedAt" timestamp with time zone not null default now(),
  constraint UserLikedProperties_pkey primary key ("Id"),
  constraint unique_user_property unique ("UserId", "MlsNumber"),
  constraint UserLikedProperties_UserId_fkey 
    foreign key ("UserId") references auth.users (id) on delete cascade
);

create index if not exists idx_liked_user_id
  on public."UserLikedProperties" ("UserId");

create index if not exists idx_liked_mls_number
  on public."UserLikedProperties" ("MlsNumber");

create index if not exists idx_liked_user_mls
  on public."UserLikedProperties" ("UserId", "MlsNumber");


/* ===============================================================
   USER NOTIFICATIONS
   =============================================================== */

create table public."UserNotifications" (
  "Id" uuid not null default gen_random_uuid(),
  "UserId" uuid not null,
  "Type" text not null,
  "Title" text not null,
  "Message" text not null,
  "Data" jsonb null default '{}'::jsonb,
  "IsRead" boolean null default false,
  "ReadAt" timestamp with time zone null,
  "CreatedAt" timestamp with time zone not null default now(),
  constraint UserNotifications_pkey primary key ("Id"),
  constraint UserNotifications_UserId_fkey
    foreign key ("UserId") references auth.users (id) on delete cascade,
  constraint UserNotifications_Type_check check (
    "Type" = any (
      array['saved_search','price_change','status_change','open_house','system']
    )
  )
);

create index if not exists idx_notifications_user_id
  on public."UserNotifications" ("UserId");

create index if not exists idx_notifications_unread
  on public."UserNotifications" ("UserId", "IsRead")
  where "IsRead" = false;

create index if not exists idx_notifications_created
  on public."UserNotifications" ("CreatedAt" desc);


/* ===============================================================
   USER PROFILES
   =============================================================== */

create table public."UserProfiles" (
  "Id" uuid not null,
  "Email" text not null,
  "FirstName" text null,
  "LastName" text null,
  "Phone" text null,
  "AvatarUrl" text null,
  "CreatedAt" timestamp with time zone not null default now(),
  "UpdatedAt" timestamp with time zone not null default now(),
  "LastLoginAt" timestamp with time zone null,
  constraint UserProfiles_pkey primary key ("Id"),
  constraint UserProfiles_Id_fkey
    foreign key ("Id") references auth.users (id) on delete cascade
);

create index if not exists idx_user_profiles_email
  on public."UserProfiles" ("Email");

create trigger update_user_profiles_updated_at
before update on "UserProfiles"
for each row execute function update_updated_at_column();


/* ===============================================================
   USER SAVED LISTINGS
   =============================================================== */

create table public."UserSavedListings" (
  "Id" uuid not null default gen_random_uuid(),
  "UserId" uuid not null,
  "MlsNumber" text not null,
  "SavedAt" timestamp with time zone not null default now(),
  "Notes" text null,
  "Tags" text[] null,
  "CreatedAt" timestamp with time zone not null default now(),
  "UpdatedAt" timestamp with time zone not null default now(),
  constraint UserSavedListings_pkey primary key ("Id"),
  constraint unique_user_saved_listing unique ("UserId", "MlsNumber"),
  constraint UserSavedListings_UserId_fkey
    foreign key ("UserId") references auth.users (id) on delete cascade
);

create index if not exists idx_saved_listings_user_id
  on public."UserSavedListings" ("UserId");

create index if not exists idx_saved_listings_mls_number
  on public."UserSavedListings" ("MlsNumber");

create index if not exists idx_saved_listings_saved_at
  on public."UserSavedListings" ("SavedAt" desc);

create index if not exists idx_saved_listings_tags
  on public."UserSavedListings" using gin ("Tags");

create trigger update_saved_listings_updated_at
before update on "UserSavedListings"
for each row execute function update_updated_at_column();


/* ===============================================================
   USER SAVED SEARCHES
   =============================================================== */

create table public."UserSavedSearches" (
  "Id" uuid not null default gen_random_uuid(),
  "UserId" uuid not null,
  "Name" text not null,
  "Filters" jsonb not null default '{}'::jsonb,
  "AlertsEnabled" boolean null default true,
  "AlertFrequency" text null default 'daily',
  "LastRunAt" timestamp with time zone null,
  "LastNotifiedAt" timestamp with time zone null,
  "NewResultsCount" integer null default 0,
  "CreatedAt" timestamp with time zone not null default now(),
  "UpdatedAt" timestamp with time zone not null default now(),
  constraint UserSavedSearches_pkey primary key ("Id"),
  constraint UserSavedSearches_UserId_fkey
    foreign key ("UserId") references auth.users (id) on delete cascade,
  constraint UserSavedSearches_AlertFrequency_check check (
    "AlertFrequency" = any (array['instant','daily','weekly','never'])
  )
);

create index if not exists idx_saved_searches_user_id
  on public."UserSavedSearches" ("UserId");

create index if not exists idx_saved_searches_alerts
  on public."UserSavedSearches" ("AlertsEnabled")
  where "AlertsEnabled" = true;

create trigger update_saved_searches_updated_at
before update on "UserSavedSearches"
for each row execute function update_updated_at_column();


/* ===============================================================
   USER VIEWING HISTORY
   =============================================================== */

create table public."UserViewingHistory" (
  "Id" uuid not null default gen_random_uuid(),
  "UserId" uuid not null,
  "MlsNumber" text not null,
  "ViewCount" integer null default 1,
  "FirstViewedAt" timestamp with time zone not null default now(),
  "LastViewedAt" timestamp with time zone not null default now(),
  constraint UserViewingHistory_pkey primary key ("Id"),
  constraint unique_user_property_view unique ("UserId", "MlsNumber"),
  constraint UserViewingHistory_UserId_fkey
    foreign key ("UserId") references auth.users (id) on delete cascade
);

create index if not exists idx_viewing_user_id
  on public."UserViewingHistory" ("UserId");

create index if not exists idx_viewing_mls_number
  on public."UserViewingHistory" ("MlsNumber");

create index if not exists idx_viewing_last_viewed
  on public."UserViewingHistory" ("LastViewedAt" desc);
