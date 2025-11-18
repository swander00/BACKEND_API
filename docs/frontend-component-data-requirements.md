# Frontend Component Data Requirements

This document catalogs the data each core frontend component consumes. It is strictly focused on the UI payloads so the backend team can source every required field (primarily from `PropertyCardView`, `PropertyDetailsView`, and listing media). No API design or implementation details are included—only the display data the components expect.

## Property Cards (Grid & List Views)

- **Identity & Location (PropertyCardView)**
  - `ListingKey`, `MLSNumber`
  - `FullAddress` (drives the one-line street string), `City`, `StateOrProvince`
  - `CityRegion` / neighbourhood label plus the frontend `tagColor`
- **Status & Timeline**
  - Display-ready `Status` plus raw `MlsStatus` and `TransactionType`
  - `IsNewListing`, `ListingAge`, `OriginalEntryTimestamp` (for “Listed X days ago”)
  - `ModificationTimestamp` for “Updated” messaging
- **Pricing & Reductions**
  - `ListPrice`, `OriginalListPrice`
  - `IsPriceReduced`, `PriceReductionAmount`, `PriceReductionPercent`, `ReductionNumber`
- **Visual Media (Media table)**
  - `PrimaryImageUrl`, ordered `Media[]` URLs, `MediaCount`
  - `HasVirtualTour`, `VirtualTourUrl`
- **Quick Specs**
  - `BedroomsDisplay` (UI), `BedroomsAboveGrade`, `BedroomsBelowGrade`
  - `BathroomsDisplay`, `BathroomsTotalInteger`
  - `LivingAreaMin`, `LivingAreaMax` (renders “Square Ft” range)
  - `ParkingTotal`, plus `CoveredSpaces` and `ParkingSpaces` for fallbacks
- **Badges & Context**
  - `PropertyType`, `PropertySubType`
  - `OpenHouseDisplay` + `HasOpenHouseToday`, `HasOpenHouseTomorrow`, `HasNextWeekendOpenHouse`
  - `location.tagColor` (frontend token) for the `LocationTag`
- **Interaction States**
  - `images[]` (hero carousel)
  - Optional `openHouse.{day,date,time}` strings

## Property Details Modal — Desktop (PropertyDetailsView)

- **Identity & Status**
  - `ListingKey`, `MLSNumber`, `MlsStatus`, `TransactionType`
  - `StatusDates`: `PurchaseContractDate`, `SuspendedDate`, `TerminatedDate`, `ExpirationDate`
  - `DaysOnMarket`, `IsNewListing`, `ModificationTimestamp`
  - Engagement metrics: `ViewCount`, `SaveCount`
- **Address & Geo**
  - `FullAddress` plus granular pieces: `StreetNumber`, `StreetName`, `StreetSuffix`, `UnitNumber`
  - `City`, `Community`, `CountyOrParish`, `StateOrProvince`, `PostalCode`
  - `Latitude`, `Longitude` (map actions)
- **Pricing & History**
  - `ListPrice`, `OriginalListPrice`, `ClosePrice`
  - `PriceReductionAmount`, `PriceReductionPercent`, `ReductionNumber`
  - `OriginalEntryTimestamp` / `ListDate`, `ModificationTimestamp`
- **Media & Tours**
  - Ordered gallery from `Media` (id, url, alt text)
  - `MediaCount`, `PrimaryImageUrl`, `HasVirtualTour`, `VirtualTourUrl`
- **Highlights / Specs Grid**
  - `BedroomsAboveGrade`, `BedroomsBelowGrade`, `BedroomsDisplay`
  - `BathroomsDisplay`, `BathroomsTotalInteger`
  - `KitchensAboveGrade`, `KitchensBelowGrade`
  - `LivingAreaMin`, `LivingAreaMax`
  - `LotSizeWidth`, `LotSizeDepth`, `LotSizeAcres`, `LotSizeUnits`
  - `ApproximateAge`, `PropertyType`, `PropertySubType`, `ArchitecturalStyle`
  - `BasementStatus`, `BasementEntrance`, `BasementKitchen`, `BasementRental`
  - `CoveredSpaces`, `ParkingSpaces`, `ParkingTotal`
  - `Possession`
- **Narrative Content**
  - `PublicRemarks` (About tab)
  - AI summary copy (when available) pulled from the same description payload
- **Listing History Card**
  - `ListDate`, `ListPrice`, `ClosePrice`, `DaysOnMarket`, `PriceReduction*`
- **Property Information Cards**
  - Interior/exterior: `InteriorFeatures`, `ExteriorFeatures`, `PropertyFeatures`, `Cooling`, `HeatType`, `Sewer`, `WaterSource`
  - Amenities & fees: `AssociationFee`, `AssociationFeeIncludes`, `AdditionalMonthlyFee`, `AssociationAmenities`, `MaintenanceFee`, `MaintenanceFeeSchedule`, `POTL*`, `PetsAllowed`, `RentIncludes`
  - Ownership: `TaxAnnualAmount`, `TaxYear`, `Furnished`, `Locker`, `BalconyType`, `PoolFeatures`, `WaterfrontFeatures`, `WaterBodyName`, `WaterView`
- **Rooms Drawer**
  - `Rooms[]` entries with `type`, `level`, `dimensions`, `features`
- **Agent Contact Card**
  - Agent profile: `name`, `title`, `company`, `avatar`
  - Performance stats: `rating`, `reviewCount`, `propertiesSold`
  - Contact channels: `phone`, `email`, `messageEndpoint`

## Property Details Modal — Mobile (PropertyDetailsView)

- **Hero Gallery & Badges**
  - Same gallery payload as desktop, plus `MlsStatus`, `PropertyType` badges, `VirtualTourUrl`
- **Address & Open House**
  - `StreetAddress`, `City`, `StateOrProvince`
  - `OpenHouseDisplay` or `OpenHouseDate` + `OpenHouseDayTime` (converted to badge copy)
- **Pricing & Taxes**
  - `ListPrice`, `PropertyTaxes` (amount), `TaxYear`
  - `DaysOnMarket`
- **Engagement Stats**
  - `ViewCount`, `SaveCount`, optional day-level metrics (`todayViews`, `todaySaves` if supplied)
- **Quick Overview Grid**
  - Ordered spec values: `BedroomsDisplay`, `BathroomsDisplay`, `LivingAreaMin/Max`, `PropertyType`, `PropertySubType`, `BasementStatus`, `ParkingTotal`, `LotSize*`, `ApproximateAge`
- **Description Tabs**
  - `PublicRemarks` (About)
  - AI summary payload (future)
- **Listing History**
  - `MLSNumber`, `MlsStatus`, `ListDate`, `ListPrice`, `ClosePrice`, `DaysOnMarket`
- **Property Information Sections**
  - `ListingInformationSection`: `PropertyType`, `PropertyClass`, `TransactionType`, `Possession`
  - `PropertyDetailsSection`: beds/baths breakdown, `LivingArea*`, `LotSize*`, `ApproximateAge`
  - `BasementSection`: `BasementStatus`, `BasementEntrance`, `BasementKitchen`, `BasementRental`
  - `CondoInfoSection`: `AssociationFee`, `AssociationFeeIncludes`, `AdditionalMonthlyFee`, `MaintenanceFee`, `Locker`, `BalconyType`, `PetsAllowed`
  - `ParkingSection`: `CoveredSpaces`, `ParkingSpaces`, `ParkingTotal`, `GarageSpaces`
  - `UtilitiesSection`: `HeatType`, `Cooling`, `WaterSource`, `Sewer`, `FireplaceYN`
  - `PoolWaterfrontSection`: `PoolFeatures`, `WaterfrontFeatures`, `WaterBodyName`, `WaterView`, `WaterfrontYN`
  - `FeaturesSection`: `InteriorFeatures`, `ExteriorFeatures`, `PropertyFeatures`, `CoolingFeatures`
- **Room Details Accordion**
  - Totals for `Bedrooms`, `Bathrooms`, `SquareFootage`, `Rooms.length`
  - `Rooms[]` with `roomType`, `level`, `roomDimensions`, `roomFeatures`
- **Contact Agent Block**
  - Same agent profile + stats + contact fields as desktop

## Suggestion Cards (Search Autocomplete)

- **Listing Suggestions (PropertyCardView fields)**
  - Identity: `ListingKey`, `MLSNumber`, `FullAddress` (`addressLine`)
  - `City`, `Community`, `StateOrProvince` (`locationLine`)
  - Pricing: `ListPrice`, `PriceReductionAmount`, `PriceReductionPercent`, derived `priceChangeLabel/color`
  - Status & recency: `MlsStatus`, `Status` label/variant, `DaysOnMarket`, `ListingAge`
  - Specs: `BedroomsAboveGrade`, `BedroomsBelowGrade`, `BathroomsTotalInteger`, `LivingAreaMin/Max`, `PropertySubType`
  - Media: thumbnail `PrimaryImageUrl`
- **Location Suggestions (static taxonomy)**
  - `id`, `type` (`city` or `community`)
  - `name`, `subtitle`, optional `badge`, `isActive`

## Property Information Popup Cards (Map Hover / Click)

- **Core Identity**
  - `ListingKey`, `Status`, `PropertySubType`
  - `FullAddress` split into street line + `City`/`StateOrProvince`
- **Hero Media**
  - `images[0]` or `PrimaryImageUrl`
- **Pricing & Timeline**
  - `ListPrice`, `ListedAt` (ISO date string), `Status`
- **Quick Metrics**
  - `BedroomsDisplay` (falls back to `BedroomsAboveGrade` + `BedroomsBelowGrade`)
  - `BathroomsDisplay`
  - `ParkingTotal` plus `CoveredSpaces`/`ParkingSpaces`
  - `LivingAreaMin/Max` (shown as square-footage label)
- **Badges & CTA Data**
  - `PropertySubType` for tag
  - Formatted `ListedAt` date for footer timestamp

---

All sections rely exclusively on the materialized view fields noted above (PropertyCardView for list/grid/search, PropertyDetailsView for modal experiences) and the Media table for gallery assets, in accordance with the data source rules.

