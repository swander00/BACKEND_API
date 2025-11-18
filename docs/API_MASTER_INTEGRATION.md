## Master API Integration Contract

### 1. Purpose & Scope
- Establish the single source of truth for how backend services expose listing data to frontend clients across grid, detail, suggestion, and map experiences.
- Align data sourcing with enforced rules: **all listing data must be served from `PropertyCardView`, `PropertyDetailsView`, `RoomDetailsView`, and `Media`** (for galleries) plus auxiliary services (analytics, agent CRM, AI summaries). Raw tables such as `Property`, `PropertyRooms`, and `OpenHouse` must never be queried directly by public APIs.
- Define both the frontend payload contracts and the backend-internal service responsibilities that produce them.

### 2. Data Source Principles
- `PropertyCardView`: optimized projection for search/list/map results and autocomplete listing suggestions.
- `PropertyDetailsView`: canonical view for property detail payloads, highlights, pricing history, taxes, utilities, and engagement counters.
- `RoomDetailsView`: denormalized room array consumed inside property detail experiences.
- `Media`: authoritative gallery source; `PrimaryImageUrl` and ordered arrays derive from this table only.
- Analytics Service: provides cumulative `ViewCount` / `SaveCount` (already materialized in `PropertyDetailsView`) and **optional** `todayViews` / `todaySaves`.
- Agent CRM Service: owns agent profile, contact, and performance metrics; backend proxies or supplies placeholders until live.
- AI Summary Service: sends `{ summary, highlights[], confidence }`; backend passes through unchanged when available.

### 3. Endpoint Overview
| Endpoint | Response | Data Sources | Notes |
| --- | --- | --- | --- |
| `GET /api/properties` | `PropertyCardResponse[]` + pagination | `PropertyCardView`, `Media` | Supports all search and filter criteria defined in `BACKEND_API_QUICK_REFERENCE.md`. |
| `GET /api/properties/{listingKey}` | `PropertyDetailsResponse` | `PropertyDetailsView`, `RoomDetailsView`, `Media`, Analytics, Agent CRM, AI Summary | Single listing detail experience for desktop + mobile. |
| `GET /api/search?q=` | `PropertySuggestionResponse` | `PropertyCardView` | Location taxonomy remains frontend-managed; backend returns listing suggestions only. |
| `GET /api/properties/map` | `MapPopupPropertyResponse[]` | `PropertyCardView`, `Media` | Same filtering as `/api/properties` plus map bounds. |
| `GET /api/media/{listingKey}` *(internal)* | Media hydration service | `Media` | Used by backend composition layer; not exposed to FE once master payloads inline media arrays. |

### 4. Payload Contracts

#### 4.1 `PropertyCardResponse`
| Field Group | Fields | Source | Notes |
| --- | --- | --- | --- |
| Identity & Location | `listingKey`, `mlsNumber`, `fullAddress`, `city`, `stateOrProvince`, `cityRegion` | `PropertyCardView` | `fullAddress` is the only address string FE displays. |
| Status & Timeline | `status`, `mlsStatus`, `transactionType`, `isNewListing`, `listingAge`, `originalEntryTimestamp`, `modificationTimestamp` | `PropertyCardView` | Use `Status` (display) + `MlsStatus` (raw). |
| Pricing | `listPrice`, `originalListPrice`, `isPriceReduced`, `priceReductionAmount`, `priceReductionPercent`, `reductionNumber` | `PropertyCardView` | Reduction metrics already formatted per data rules. |
| Media | `primaryImageUrl`, `media` (array of `{id,url,alt}`), `mediaCount`, `hasVirtualTour`, `virtualTourUrl` | `PropertyCardView` + `Media` | `media` array ordered by `PreferredPhotoYN DESC, Order ASC`. |
| Quick Specs | `bedroomsDisplay`, `bedroomsAboveGrade`, `bedroomsBelowGrade`, `bathroomsDisplay`, `bathroomsTotalInteger`, `livingAreaMin`, `livingAreaMax`, `parkingTotal`, `coveredSpaces`, `parkingSpaces`, `garageSpaces` | `PropertyCardView` | `garageSpaces` derived from `coveredSpaces` when not explicitly available; FE displays dedicated badge. |
| Badges & Context | `propertyType`, `propertySubType`, `openHouseDisplay`, `hasOpenHouseToday`, `hasOpenHouseTomorrow`, `hasNextWeekendOpenHouse` | `PropertyCardView` | `openHouseDisplay` is the only open-house text surface requires. |
| Interaction State | `images` (hero carousel reuse of `media`), `virtualTourUrl` | `Media` | Provided so FE can preload the gallery without additional fetches. |

#### 4.2 `PropertyDetailsResponse`
| Section | Fields | Source | Notes |
| --- | --- | --- | --- |
| Identity & Status | `listingKey`, `mlsNumber`, `mlsStatus`, `transactionType`, `statusDates` (`purchaseContractDate`, `suspendedDate`, `terminatedDate`, `expirationDate`), `daysOnMarket`, `isNewListing`, `modificationTimestamp` | `PropertyDetailsView` | Aligns with desktop + mobile header badges. |
| Engagement | `viewCount`, `saveCount`, `todayViews?`, `todaySaves?` | `PropertyDetailsView` + Analytics | Day-level metrics optional; omit when unavailable. |
| Address & Geo | `fullAddress`, `streetNumber`, `streetName`, `streetSuffix`, `unitNumber`, `city`, `community`, `countyOrParish`, `stateOrProvince`, `postalCode`, `latitude`, `longitude` | `PropertyDetailsView` | `fullAddress` drives display; granular fields for map/share actions. |
| Pricing & History | `listPrice`, `originalListPrice`, `closePrice`, `priceReductionAmount`, `priceReductionPercent`, `reductionNumber`, `originalEntryTimestamp`, `listDate`, `modificationTimestamp` | `PropertyDetailsView` | History card reuses these fields. |
| Taxes | `taxAnnualAmount`, `taxYear` | `PropertyDetailsView` | FE refers to `PropertyTaxes`. |
| Media & Tours | `media` array, `primaryImageUrl`, `mediaCount`, `hasVirtualTour`, `virtualTourUrl`, optional `order`, `caption`, `dimensions` | `Media` | Additional metadata included when stored; otherwise omitted. |
| Highlights / Specs Grid | `bedroomsAboveGrade`, `bedroomsBelowGrade`, `bedroomsDisplay`, `bathroomsDisplay`, `bathroomsTotalInteger`, `kitchensAboveGrade`, `kitchensBelowGrade`, `livingAreaMin`, `livingAreaMax`, `lotSizeWidth`, `lotSizeDepth`, `lotSizeAcres`, `lotSizeUnits`, `approximateAge`, `propertyType`, `propertySubType`, `architecturalStyle`, `basementStatus`, `basementEntrance`, `basementKitchen`, `basementRental`, `coveredSpaces`, `parkingSpaces`, `parkingTotal`, `garageSpaces`, `possession` | `PropertyDetailsView` | `garageSpaces` derived if absent. |
| Narrative | `publicRemarks`, `aiSummary?` (`summary`, `highlights[]`, `confidence`) | `PropertyDetailsView` + AI service | Fallback to remarks when AI block missing. |
| Listing History | Array of `{ listDate, listPrice, closePrice, daysOnMarket, priceReductionAmount?, priceReductionPercent? }` | `PropertyDetailsView` | Provide chronological entries when view exposes them. |
| Property Information Cards | Interior, exterior, amenities, ownership, utilities, pool/waterfront, features fields exactly as enumerated in frontend doc (e.g., `interiorFeatures`, `exteriorFeatures`, `propertyFeatures`, `cooling`, `heatType`, `sewer`, `waterSource`, `associationFee`, `associationFeeIncludes`, `additionalMonthlyFee`, `associationAmenities`, `maintenanceFee`, `maintenanceFeeSchedule`, `potl`, `petsAllowed`, `rentIncludes`, `taxAnnualAmount`, `taxYear`, `furnished`, `locker`, `balconyType`, `poolFeatures`, `waterfrontFeatures`, `waterBodyName`, `waterView`, `waterfrontYN`, `fireplaceYN`) | `PropertyDetailsView` | Maintain exact casing to match FE expectations. |
| Rooms Drawer | `summary` (`totalBedrooms`, `totalBathrooms`, `squareFootage`, `roomCount`), `rooms[]` from `RoomDetailsView` with `{ id, roomType, level, dimensions, features[] }` | `RoomDetailsView` | Backend ensures ordering by level then room order. |
| Open House | `openHouseDisplay`, `openHouseEvents[]?` (future) | `PropertyDetailsView` | Mobile may also use `openHouseDate` + `openHouseDayTime`; convert upstream to display string. |
| Agent Contact Card | `agent` object `{ name, title, company, avatarUrl, phone, email, messageUrl, rating?, reviewCount?, propertiesSold? }` | Agent CRM (or placeholder service) | Placeholders allowed until CRM integration live. |

#### 4.3 `PropertySuggestionResponse`
- Structure:
  ```json
  {
    "listings": PropertyCardResponse[],
    "meta": {
      "totalCount": number,
      "query": string
    }
  }
  ```
- Notes:
  - Only listing suggestions return from backend; **location suggestions remain client-owned taxonomy** refreshed in the frontend bundle.
  - Listing suggestion entries are the slimmed `PropertyCardResponse` subset: identity, location, list price, reduction stats, `bedroomsAboveGrade`, `bedroomsBelowGrade`, `bathroomsTotalInteger`, `livingAreaMin`, `livingAreaMax`, `propertySubType`, and `primaryImageUrl`.

#### 4.4 `MapPopupPropertyResponse`
| Field | Description | Source |
| --- | --- | --- |
| `listingKey`, `status`, `propertySubType` | Identify listing and label tag | `PropertyCardView` |
| `fullAddress`, `city`, `stateOrProvince` | Display-split address lines | `PropertyCardView` |
| `coordinates` `{ latitude, longitude }` | Map placement | `PropertyCardView` |
| `primaryImageUrl` / `images[0]` | Hero thumbnail | `Media` |
| `listPrice`, `listedAt` (`originalEntryTimestamp`), `status` | Pricing + timeline | `PropertyCardView` |
| Quick Metrics | `bedroomsDisplay`, fallback `bedroomsAboveGrade + bedroomsBelowGrade`, `bathroomsDisplay`, `parkingTotal`, `coveredSpaces`, `parkingSpaces`, `livingAreaMin`, `livingAreaMax` | `PropertyCardView` |

### 5. Backend Composition Flow
1. **Search/List/Map Requests**
   - Query `PropertyCardView` with validated filters; enforce view-only access.
   - Hydrate `primaryImageUrl`, `mediaCount`, and hero carousel arrays via `Media` table joins or cached lookup.
   - Derive `garageSpaces` from `coveredSpaces` when missing; include optional media metadata when stored.
2. **Property Detail Requests**
   - Fetch base record from `PropertyDetailsView` by `ListingKey`.
   - Parallel fetches:
     - `RoomDetailsView` for `rooms[]`.
     - `Media` for gallery assets (include `order`, `caption`, `dimensions` if stored).
     - Analytics service for optional day-level metrics.
     - Agent CRM for contact + performance data (fallback to placeholder object when unavailable).
     - AI summary service for marketing content; omit when service fails.
   - Compose into `PropertyDetailsResponse`, ensuring frontend field casing.
3. **Caching & Versioning**
   - Vary cache keys by filter signature + page for `PropertyCardResponse`.
   - For details, short-lived cache (e.g., 5 minutes) to keep price reductions timely.
   - Include `schemaVersion` metadata if future breaking changes expected.

### 6. Validation & Formatting Rules
- **Addresses:** Always emit `fullAddress`. Street components only for detail payload.
- **Bedrooms/Bathrooms:** Use `BedroomsDisplay`/`BathroomsDisplay` for UI labels; `BedroomsTotal` is deprecated and must never be surfaced.
- **Open Houses:** Provide `openHouseDisplay` string; if precise schedule arrays are added later, keep this field for backwards compatibility.
- **Price Reductions:** Use formatted `PriceReductionAmount` string and numeric `PriceReductionPercent`; `isPriceReduced` toggles card badge.
- **Lot Measurements:** Maintain both numeric and unit fields. Do not compute derived square footage on the fly.
- **Media Ordering:** Respect `PreferredPhotoYN` then `Order`. Always include `primaryImageUrl` even when gallery empty (fallback placeholder URL).
- **Optional Blocks:** When optional services (analytics, agent, AI) fail, return `null` for their respective objects so FE can hide modules without guesswork.

### 7. Open Questions / Future Enhancements
- Will we persist media `caption` and `dimensions` in the `Media` table or a companion metadata store? (Currently optional; roadmap item.)
- Confirm timing for CRM integration so backend can remove placeholder agent mocks.
- Determine whether day-level analytics will be added to `PropertyDetailsView` materialization or fetched live per request.
- Decide if backend will eventually own the location taxonomy to keep FE bundle slimmer; if yes, define ingestion pipeline for weekly updates.

### 8. Next Steps
- Backend to implement response mappers conforming to the above payloads and share sample JSON fixtures with frontend for validation.
- Frontend to verify naming alignment (`PropertyCardResponse`, etc.) and highlight any additional optional fields needed before release.
- Once both sides approve, document becomes binding interface reference for future releases; subsequent changes require versioning callouts in this file.

