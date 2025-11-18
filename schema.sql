-- ============================================================================
-- COMPLETE DATABASE SCHEMA
-- Generated from Supabase database
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pg_trgm" SCHEMA public;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."UpdatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update combined features in PropertyRooms
CREATE OR REPLACE FUNCTION update_combined_features()
RETURNS TRIGGER AS $$
BEGIN
    NEW."CombinedFeatures" = CONCAT_WS(', ',
        NULLIF(NEW."RoomFeature1", ''),
        NULLIF(NEW."RoomFeature2", ''),
        NULLIF(NEW."RoomFeature3", '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update room measurements
CREATE OR REPLACE FUNCTION update_room_measurements()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."RoomLength" IS NOT NULL AND NEW."RoomWidth" IS NOT NULL THEN
        NEW."RoomMeasurements" = NEW."RoomLength"::text || ' x ' || NEW."RoomWidth"::text;
        IF NEW."RoomAreaUnits" IS NOT NULL THEN
            NEW."RoomMeasurements" = NEW."RoomMeasurements" || ' ' || NEW."RoomAreaUnits";
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public."UserProfiles" ("Id", "Email", "CreatedAt", "UpdatedAt")
    VALUES (NEW.id, NEW.email, NOW(), NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to get unread notification count
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id uuid)
RETURNS integer AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::integer
        FROM public."UserNotifications"
        WHERE "UserId" = p_user_id AND "IsRead" = false
    );
END;
$$ LANGUAGE plpgsql;

-- Function to mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id uuid, p_user_id uuid)
RETURNS boolean AS $$
BEGIN
    UPDATE public."UserNotifications"
    SET "IsRead" = true, "ReadAt" = NOW()
    WHERE "Id" = p_notification_id AND "UserId" = p_user_id;
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to mark all notifications as read
CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_user_id uuid)
RETURNS integer AS $$
DECLARE
    affected_rows integer;
BEGIN
    UPDATE public."UserNotifications"
    SET "IsRead" = true, "ReadAt" = NOW()
    WHERE "UserId" = p_user_id AND "IsRead" = false;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RETURN affected_rows;
END;
$$ LANGUAGE plpgsql;

-- Function to get user saved count
CREATE OR REPLACE FUNCTION get_user_saved_count(p_user_id uuid)
RETURNS integer AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::integer
        FROM public."UserSavedListings"
        WHERE "UserId" = p_user_id
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get user liked count
CREATE OR REPLACE FUNCTION get_user_liked_count(p_user_id uuid)
RETURNS integer AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::integer
        FROM public."UserLikedProperties"
        WHERE "UserId" = p_user_id
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get distinct media properties
CREATE OR REPLACE FUNCTION get_distinct_media_properties()
RETURNS bigint AS $$
BEGIN
    RETURN (
        SELECT COUNT(DISTINCT "ResourceRecordKey")
        FROM public."Media"
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get distinct openhouse properties
CREATE OR REPLACE FUNCTION get_distinct_openhouse_properties()
RETURNS bigint AS $$
BEGIN
    RETURN (
        SELECT COUNT(DISTINCT "ListingKey")
        FROM public."OpenHouse"
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get distinct rooms properties
CREATE OR REPLACE FUNCTION get_distinct_rooms_properties()
RETURNS bigint AS $$
BEGIN
    RETURN (
        SELECT COUNT(DISTINCT "ListingKey")
        FROM public."PropertyRooms"
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get media coverage
CREATE OR REPLACE FUNCTION get_media_coverage()
RETURNS TABLE(properties_with_media bigint, total_media bigint, avg_per_property numeric) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT "ResourceRecordKey") as properties_with_media,
        COUNT(*) as total_media,
        ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT "ResourceRecordKey"), 0), 2) as avg_per_property
    FROM public."Media";
END;
$$ LANGUAGE plpgsql;

-- Function to get media coverage stats
CREATE OR REPLACE FUNCTION get_media_coverage_stats()
RETURNS TABLE(total_media bigint, unique_properties bigint) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_media,
        COUNT(DISTINCT "ResourceRecordKey") as unique_properties
    FROM public."Media";
END;
$$ LANGUAGE plpgsql;

-- Function to get openhouse coverage
CREATE OR REPLACE FUNCTION get_openhouse_coverage()
RETURNS TABLE(properties_with_openhouse bigint, total_openhouse bigint, future_events bigint) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT "ListingKey") as properties_with_openhouse,
        COUNT(*) as total_openhouse,
        COUNT(*) FILTER (WHERE "OpenHouseDate" >= CURRENT_DATE) as future_events
    FROM public."OpenHouse";
END;
$$ LANGUAGE plpgsql;

-- Function to get rooms coverage
CREATE OR REPLACE FUNCTION get_rooms_coverage()
RETURNS TABLE(properties_with_rooms bigint, total_rooms bigint, avg_per_property numeric) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT "ListingKey") as properties_with_rooms,
        COUNT(*) as total_rooms,
        ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT "ListingKey"), 0), 2) as avg_per_property
    FROM public."PropertyRooms";
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TABLES
-- ============================================================================

-- Table: Property
CREATE TABLE public."Property" (
    "ListingKey" text NOT NULL,
    "ListPrice" numeric,
    "ClosePrice" numeric,
    "MlsStatus" text,
    "ContractStatus" text,
    "StandardStatus" text,
    "TransactionType" text,
    "PropertyType" text,
    "PropertySubType" text,
    "ArchitecturalStyle" text[],
    "UnparsedAddress" text,
    "StreetNumber" text,
    "StreetName" text,
    "StreetSuffix" text,
    "City" text,
    "StateOrProvince" text,
    "PostalCode" text,
    "CountyOrParish" text,
    "CityRegion" text,
    "UnitNumber" text,
    "KitchensAboveGrade" numeric,
    "BedroomsAboveGrade" numeric,
    "BedroomsBelowGrade" numeric,
    "KitchensBelowGrade" numeric,
    "KitchensTotal" numeric,
    "DenFamilyRoomYN" text,
    "PublicRemarks" text,
    "PossessionDetails" text,
    "PhotosChangeTimestamp" timestamptz,
    "MediaChangeTimestamp" timestamptz,
    "ModificationTimestamp" timestamptz,
    "SystemModificationTimestamp" timestamptz,
    "OriginalEntryTimestamp" timestamptz,
    "SoldConditionalEntryTimestamp" timestamptz,
    "SoldEntryTimestamp" timestamptz,
    "SuspendedEntryTimestamp" timestamptz,
    "TerminatedEntryTimestamp" timestamptz,
    "CloseDate" date,
    "ConditionalExpiryDate" date,
    "PurchaseContractDate" date,
    "SuspendedDate" date,
    "TerminatedDate" date,
    "UnavailableDate" date,
    "Cooling" text[],
    "Sewer" text[],
    "Basement" text[],
    "BasementEntrance" text,
    "ExteriorFeatures" text[],
    "InteriorFeatures" text[],
    "PoolFeatures" text[],
    "PropertyFeatures" text[],
    "HeatType" text,
    "FireplaceYN" text,
    "LivingAreaRange" text,
    "WaterfrontYN" text,
    "PossessionType" text,
    "CoveredSpaces" numeric,
    "ParkingSpaces" numeric,
    "ParkingTotal" numeric,
    "AssociationAmenities" text[],
    "Locker" text,
    "BalconyType" text,
    "PetsAllowed" text[],
    "AssociationFee" numeric,
    "AssociationFeeIncludes" text[],
    "ApproximateAge" text,
    "AdditionalMonthlyFee" numeric,
    "TaxAnnualAmount" numeric,
    "TaxYear" integer,
    "LotDepth" numeric,
    "LotWidth" numeric,
    "LotSizeUnits" text,
    "Furnished" text,
    "RentIncludes" text[],
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    "UpdatedAt" timestamptz NOT NULL DEFAULT now(),
    "BathroomsTotalInteger" numeric,
    "ExpirationDate" date,
    "VirtualTourURLUnbranded" text,
    CONSTRAINT "Property_pkey" PRIMARY KEY ("ListingKey")
);

-- Table: Media
CREATE TABLE public."Media" (
    "MediaKey" text NOT NULL,
    "ResourceRecordKey" text NOT NULL,
    "MediaObjectID" text,
    "MediaURL" text NOT NULL,
    "MediaCategory" text,
    "MediaType" text,
    "MediaStatus" text,
    "ImageOf" text,
    "ClassName" text,
    "ImageSizeDescription" text,
    "Order" integer,
    "PreferredPhotoYN" text,
    "ShortDescription" text,
    "ResourceName" text,
    "OriginatingSystemID" text,
    "MediaModificationTimestamp" timestamptz,
    "ModificationTimestamp" timestamptz,
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    "UpdatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "Media_pkey" PRIMARY KEY ("MediaKey"),
    CONSTRAINT fk_media_property FOREIGN KEY ("ResourceRecordKey") 
        REFERENCES public."Property"("ListingKey") ON DELETE CASCADE
);

-- Table: OpenHouse
CREATE TABLE public."OpenHouse" (
    "OpenHouseKey" text NOT NULL,
    "ListingKey" text NOT NULL,
    "OpenHouseDate" date,
    "OpenHouseStartTime" time,
    "OpenHouseEndTime" time,
    "OpenHouseRemarks" text,
    "OpenHouseStatus" text,
    "OpenHouseType" text,
    "ShowingAgentKey" text,
    "ShowingAgentKeyNumeric" integer,
    "ModificationTimestamp" timestamptz,
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    "UpdatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "OpenHouse_pkey" PRIMARY KEY ("OpenHouseKey"),
    CONSTRAINT fk_openhouse_property FOREIGN KEY ("ListingKey") 
        REFERENCES public."Property"("ListingKey") ON DELETE CASCADE
);

-- Table: PropertyRooms
CREATE TABLE public."PropertyRooms" (
    "RoomKey" text NOT NULL,
    "ListingKey" text NOT NULL,
    "RoomType" text,
    "RoomLevel" text,
    "RoomLength" numeric,
    "RoomWidth" numeric,
    "RoomDescription" text,
    "ModificationTimestamp" timestamptz,
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    "UpdatedAt" timestamptz NOT NULL DEFAULT now(),
    "RoomAreaUnits" text,
    "RoomFeature1" text,
    "RoomFeature2" text,
    "RoomFeature3" text,
    "CombinedFeatures" text,
    "RoomMeasurements" text,
    CONSTRAINT "PropertyRooms_pkey" PRIMARY KEY ("RoomKey"),
    CONSTRAINT fk_rooms_property FOREIGN KEY ("ListingKey") 
        REFERENCES public."Property"("ListingKey") ON DELETE CASCADE
);

-- Table: SyncState
CREATE TABLE public."SyncState" (
    "SyncType" text NOT NULL,
    "LastTimestamp" timestamptz NOT NULL,
    "LastKey" text NOT NULL,
    "TotalProcessed" integer DEFAULT 0,
    "LastRunStarted" timestamptz,
    "LastRunCompleted" timestamptz,
    "Status" text DEFAULT 'idle',
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    "UpdatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("SyncType")
);

-- Table: UserProfiles
CREATE TABLE public."UserProfiles" (
    "Id" uuid NOT NULL,
    "Email" text NOT NULL,
    "FirstName" text,
    "LastName" text,
    "Phone" text,
    "AvatarUrl" text,
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    "UpdatedAt" timestamptz NOT NULL DEFAULT now(),
    "LastLoginAt" timestamptz,
    CONSTRAINT "UserProfiles_pkey" PRIMARY KEY ("Id")
);

-- Table: UserBuyerPreferences
CREATE TABLE public."UserBuyerPreferences" (
    "Id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "UserId" uuid NOT NULL,
    "FirstTimeBuyer" boolean,
    "PreApproved" boolean,
    "HasHouseToSell" boolean,
    "PurchaseTimeframe" text,
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    "UpdatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "UserBuyerPreferences_pkey" PRIMARY KEY ("Id"),
    CONSTRAINT "UserBuyerPreferences_PurchaseTimeframe_check" 
        CHECK ("PurchaseTimeframe" = ANY (ARRAY['0-3', '3-6', '6-12', '12+'])),
    CONSTRAINT unique_user_buyer_prefs UNIQUE ("UserId")
);

-- Table: UserLikedProperties
CREATE TABLE public."UserLikedProperties" (
    "Id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "UserId" uuid NOT NULL,
    "MlsNumber" text NOT NULL,
    "LikedAt" timestamptz NOT NULL DEFAULT now(),
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "UserLikedProperties_pkey" PRIMARY KEY ("Id"),
    CONSTRAINT unique_user_property UNIQUE ("UserId", "MlsNumber")
);

-- Table: UserNotifications
CREATE TABLE public."UserNotifications" (
    "Id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "UserId" uuid NOT NULL,
    "Type" text NOT NULL,
    "Title" text NOT NULL,
    "Message" text NOT NULL,
    "Data" jsonb DEFAULT '{}'::jsonb,
    "IsRead" boolean DEFAULT false,
    "ReadAt" timestamptz,
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "UserNotifications_pkey" PRIMARY KEY ("Id"),
    CONSTRAINT "UserNotifications_Type_check" 
        CHECK ("Type" = ANY (ARRAY['saved_search', 'price_change', 'status_change', 'open_house', 'system']))
);

-- Table: UserSavedListings
CREATE TABLE public."UserSavedListings" (
    "Id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "UserId" uuid NOT NULL,
    "MlsNumber" text NOT NULL,
    "SavedAt" timestamptz NOT NULL DEFAULT now(),
    "Notes" text,
    "Tags" text[],
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    "UpdatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "UserSavedListings_pkey" PRIMARY KEY ("Id"),
    CONSTRAINT unique_user_saved_listing UNIQUE ("UserId", "MlsNumber")
);

-- Table: UserSavedSearches
CREATE TABLE public."UserSavedSearches" (
    "Id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "UserId" uuid NOT NULL,
    "Name" text NOT NULL,
    "Filters" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "AlertsEnabled" boolean DEFAULT true,
    "AlertFrequency" text DEFAULT 'daily',
    "LastRunAt" timestamptz,
    "LastNotifiedAt" timestamptz,
    "NewResultsCount" integer DEFAULT 0,
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    "UpdatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "UserSavedSearches_pkey" PRIMARY KEY ("Id"),
    CONSTRAINT "UserSavedSearches_AlertFrequency_check" 
        CHECK ("AlertFrequency" = ANY (ARRAY['instant', 'daily', 'weekly', 'never']))
);

-- Table: UserViewingHistory
CREATE TABLE public."UserViewingHistory" (
    "Id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "UserId" uuid NOT NULL,
    "MlsNumber" text NOT NULL,
    "ViewCount" integer DEFAULT 1,
    "FirstViewedAt" timestamptz NOT NULL DEFAULT now(),
    "LastViewedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "UserViewingHistory_pkey" PRIMARY KEY ("Id"),
    CONSTRAINT unique_user_property_view UNIQUE ("UserId", "MlsNumber")
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Media indexes
CREATE INDEX idx_media_modification_key ON public."Media" USING btree ("ModificationTimestamp", "MediaKey");
CREATE INDEX idx_media_preferred_photo ON public."Media" USING btree ("ResourceRecordKey", "PreferredPhotoYN") WHERE ("PreferredPhotoYN" = 'Y');
CREATE INDEX idx_media_resource_order ON public."Media" USING btree ("ResourceRecordKey", "Order");
CREATE INDEX idx_media_resource_record_key ON public."Media" USING btree ("ResourceRecordKey");
CREATE INDEX idx_media_size_description ON public."Media" USING btree ("ImageSizeDescription");

-- OpenHouse indexes
CREATE INDEX idx_openhouse_date ON public."OpenHouse" USING btree ("OpenHouseDate");
CREATE INDEX idx_openhouse_listing_key ON public."OpenHouse" USING btree ("ListingKey");
CREATE INDEX idx_openhouse_modification ON public."OpenHouse" USING btree ("ModificationTimestamp");
CREATE INDEX idx_openhouse_status ON public."OpenHouse" USING btree ("OpenHouseStatus");

-- Property indexes
CREATE INDEX idx_property_address_trgm ON public."Property" USING gin ("UnparsedAddress" gin_trgm_ops) WHERE ("UnparsedAddress" IS NOT NULL);
CREATE INDEX idx_property_bathrooms_total ON public."Property" USING btree ("BathroomsTotalInteger") WHERE ("BathroomsTotalInteger" IS NOT NULL);
CREATE INDEX idx_property_bedrooms_above ON public."Property" USING btree ("BedroomsAboveGrade") WHERE ("BedroomsAboveGrade" IS NOT NULL);
CREATE INDEX idx_property_beds_baths_modified ON public."Property" USING btree ("BedroomsAboveGrade", "BathroomsTotalInteger", "ModificationTimestamp" DESC) WHERE (("BedroomsAboveGrade" IS NOT NULL) AND ("BathroomsTotalInteger" IS NOT NULL));
CREATE INDEX idx_property_city ON public."Property" USING btree ("City");
CREATE INDEX idx_property_city_beds_baths ON public."Property" USING btree ("City", "BedroomsAboveGrade", "BathroomsTotalInteger") WHERE (("City" IS NOT NULL) AND ("BedroomsAboveGrade" IS NOT NULL) AND ("BathroomsTotalInteger" IS NOT NULL));
CREATE INDEX idx_property_city_listingkey ON public."Property" USING btree ("City", "ListingKey" DESC);
CREATE INDEX idx_property_contract_status ON public."Property" USING btree ("ContractStatus");
CREATE INDEX idx_property_expiration_date ON public."Property" USING btree ("ExpirationDate") WHERE ("ExpirationDate" IS NOT NULL);
CREATE INDEX idx_property_list_price ON public."Property" USING btree ("ListPrice") WHERE ("ListPrice" IS NOT NULL);
CREATE INDEX idx_property_listingkey ON public."Property" USING btree ("ListingKey" DESC);
CREATE INDEX idx_property_listprice ON public."Property" USING btree ("ListPrice" DESC NULLS LAST);
CREATE INDEX idx_property_mls_status ON public."Property" USING btree ("MlsStatus");
CREATE INDEX idx_property_mlsstatus ON public."Property" USING btree ("MlsStatus");
CREATE INDEX idx_property_modification ON public."Property" USING btree ("ModificationTimestamp" DESC);
CREATE INDEX idx_property_modification_listing ON public."Property" USING btree ("ModificationTimestamp", "ListingKey");
CREATE INDEX idx_property_original_entry ON public."Property" USING btree ("OriginalEntryTimestamp");
CREATE INDEX idx_property_postal_code ON public."Property" USING btree ("PostalCode");
CREATE INDEX idx_property_price_modified ON public."Property" USING btree ("ListPrice", "ModificationTimestamp" DESC) WHERE ("ListPrice" IS NOT NULL);
CREATE INDEX idx_property_property_type ON public."Property" USING btree ("PropertyType");
CREATE INDEX idx_property_state ON public."Property" USING btree ("StateOrProvince");
CREATE INDEX idx_property_status_listingkey ON public."Property" USING btree ("MlsStatus", "ListingKey" DESC);
CREATE INDEX idx_property_streetname_trgm ON public."Property" USING gin ("StreetName" gin_trgm_ops) WHERE ("StreetName" IS NOT NULL);
CREATE INDEX idx_property_subtype ON public."Property" USING btree ("PropertySubType");

-- PropertyRooms indexes
CREATE INDEX idx_rooms_listing_key ON public."PropertyRooms" USING btree ("ListingKey");
CREATE INDEX idx_rooms_modification ON public."PropertyRooms" USING btree ("ModificationTimestamp");
CREATE INDEX idx_rooms_type ON public."PropertyRooms" USING btree ("RoomType");

-- UserBuyerPreferences indexes
CREATE INDEX idx_buyer_prefs_user_id ON public."UserBuyerPreferences" USING btree ("UserId");

-- UserLikedProperties indexes
CREATE INDEX idx_liked_mls_number ON public."UserLikedProperties" USING btree ("MlsNumber");
CREATE INDEX idx_liked_user_id ON public."UserLikedProperties" USING btree ("UserId");
CREATE INDEX idx_liked_user_mls ON public."UserLikedProperties" USING btree ("UserId", "MlsNumber");

-- UserNotifications indexes
CREATE INDEX idx_notifications_created ON public."UserNotifications" USING btree ("CreatedAt" DESC);
CREATE INDEX idx_notifications_unread ON public."UserNotifications" USING btree ("UserId", "IsRead") WHERE ("IsRead" = false);
CREATE INDEX idx_notifications_user_id ON public."UserNotifications" USING btree ("UserId");

-- UserProfiles indexes
CREATE INDEX idx_user_profiles_email ON public."UserProfiles" USING btree ("Email");

-- UserSavedListings indexes
CREATE INDEX idx_saved_listings_mls_number ON public."UserSavedListings" USING btree ("MlsNumber");
CREATE INDEX idx_saved_listings_saved_at ON public."UserSavedListings" USING btree ("SavedAt" DESC);
CREATE INDEX idx_saved_listings_tags ON public."UserSavedListings" USING gin ("Tags");
CREATE INDEX idx_saved_listings_user_id ON public."UserSavedListings" USING btree ("UserId");

-- UserSavedSearches indexes
CREATE INDEX idx_saved_searches_alerts ON public."UserSavedSearches" USING btree ("AlertsEnabled") WHERE ("AlertsEnabled" = true);
CREATE INDEX idx_saved_searches_user_id ON public."UserSavedSearches" USING btree ("UserId");

-- UserViewingHistory indexes
CREATE INDEX idx_viewing_last_viewed ON public."UserViewingHistory" USING btree ("LastViewedAt" DESC);
CREATE INDEX idx_viewing_mls_number ON public."UserViewingHistory" USING btree ("MlsNumber");
CREATE INDEX idx_viewing_user_id ON public."UserViewingHistory" USING btree ("UserId");

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Media triggers
CREATE TRIGGER update_media_updated_at
    BEFORE UPDATE ON public."Media"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- OpenHouse triggers
CREATE TRIGGER update_openhouse_updated_at
    BEFORE UPDATE ON public."OpenHouse"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Property triggers
CREATE TRIGGER update_property_updated_at
    BEFORE UPDATE ON public."Property"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- PropertyRooms triggers
CREATE TRIGGER trigger_update_combined_features
    BEFORE INSERT OR UPDATE ON public."PropertyRooms"
    FOR EACH ROW
    EXECUTE FUNCTION update_combined_features();

CREATE TRIGGER trigger_update_room_measurements
    BEFORE INSERT OR UPDATE ON public."PropertyRooms"
    FOR EACH ROW
    EXECUTE FUNCTION update_room_measurements();

CREATE TRIGGER update_rooms_updated_at
    BEFORE UPDATE ON public."PropertyRooms"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- SyncState triggers
CREATE TRIGGER update_syncstate_updated_at
    BEFORE UPDATE ON public."SyncState"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- UserBuyerPreferences triggers
CREATE TRIGGER update_buyer_prefs_updated_at
    BEFORE UPDATE ON public."UserBuyerPreferences"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- UserProfiles triggers
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON public."UserProfiles"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- UserSavedListings triggers
CREATE TRIGGER update_saved_listings_updated_at
    BEFORE UPDATE ON public."UserSavedListings"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- UserSavedSearches triggers
CREATE TRIGGER update_saved_searches_updated_at
    BEFORE UPDATE ON public."UserSavedSearches"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Note: The PropertyCard and PropertyDetailsView are extremely long.
-- For production use, consider keeping these in separate migration files.

-- View: media_coverage_stats
CREATE OR REPLACE VIEW public.media_coverage_stats AS
SELECT 
    COUNT(*) as total_media,
    COUNT(DISTINCT "ResourceRecordKey") as unique_properties
FROM public."Media";

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public."Property" IS 'Main property listings table containing MLS property data';
COMMENT ON TABLE public."Media" IS 'Property media (photos, videos, etc.) linked to listings';
COMMENT ON TABLE public."OpenHouse" IS 'Open house events for properties';
COMMENT ON TABLE public."PropertyRooms" IS 'Detailed room information for properties';
COMMENT ON TABLE public."SyncState" IS 'Tracks synchronization state for external data sources';
COMMENT ON TABLE public."UserProfiles" IS 'User profile information';
COMMENT ON TABLE public."UserBuyerPreferences" IS 'Buyer preferences and qualifications';
COMMENT ON TABLE public."UserLikedProperties" IS 'Properties liked/favorited by users';
COMMENT ON TABLE public."UserNotifications" IS 'User notifications and alerts';
COMMENT ON TABLE public."UserSavedListings" IS 'Properties saved by users with notes and tags';
COMMENT ON TABLE public."UserSavedSearches" IS 'Saved search filters with alert preferences';
COMMENT ON TABLE public."UserViewingHistory" IS 'Track which properties users have viewed';

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================