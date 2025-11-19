# Filters API Documentation

This document describes the filter logic and mapping rules for the real estate search system.

## Status Filter

The Status filter allows users to filter properties by their listing status. The frontend passes a single status selection using snake_case values: `for_sale`, `for_lease`, `sold`, `leased`, `removed`.

### Status Mapping Rules

#### 1. FOR SALE (`for_sale`)

A listing should be considered **For Sale** when **ANY** of the following are true:

**A. Direct MLS statuses:**
- `MlsStatus = 'For Sale'`
- `MlsStatus = 'Sold Conditional'`
- `MlsStatus = 'Sold Conditional Escape'`

**B. Special cases (requires TransactionType check):**
- `MlsStatus = 'Price Change'` AND `TransactionType = 'For Sale'`
- `MlsStatus = 'Extension'` AND `TransactionType = 'For Sale'`
- `MlsStatus = 'New'` AND `TransactionType = 'For Sale'`

**Query Logic:**
```sql
(MlsStatus IN ('For Sale', 'Sold Conditional', 'Sold Conditional Escape'))
OR
(MlsStatus IN ('Price Change', 'Extension', 'New') AND TransactionType = 'For Sale')
```

---

#### 2. FOR LEASE (`for_lease`)

A listing should be considered **For Lease** when **ANY** of the following are true:

**A. Direct MLS statuses:**
- `MlsStatus = 'For Lease'`
- `MlsStatus = 'For Sub-Lease'`
- `MlsStatus = 'For Lease Conditional'`
- `MlsStatus = 'For Lease Conditional Escape'`

**B. Special cases (requires TransactionType check):**
- `MlsStatus = 'Price Change'` AND `TransactionType = 'For Lease'`
- `MlsStatus = 'Extension'` AND `TransactionType = 'For Lease'`
- `MlsStatus = 'New'` AND `TransactionType = 'For Lease'`

**Query Logic:**
```sql
(MlsStatus IN ('For Lease', 'For Sub-Lease', 'For Lease Conditional', 'For Lease Conditional Escape'))
OR
(MlsStatus IN ('Price Change', 'Extension', 'New') AND TransactionType = 'For Lease')
```

---

#### 3. SOLD (`sold`)

A listing belongs to **Sold** when:
- `MlsStatus = 'Sold'`

**Query Logic:**
```sql
MlsStatus = 'Sold'
```

---

#### 4. LEASED (`leased`)

A listing belongs to **Leased** when:
- `MlsStatus = 'Leased'`

**Query Logic:**
```sql
MlsStatus = 'Leased'
```

---

#### 5. REMOVED (`removed`)

A listing belongs to **Removed** when `MlsStatus` is any of the following:
- `MlsStatus = 'Terminated'`
- `MlsStatus = 'Expired'`
- `MlsStatus = 'Suspended'`
- `MlsStatus = 'Cancelled'`
- `MlsStatus = 'Withdrawn'`

**Query Logic:**
```sql
MlsStatus IN ('Terminated', 'Expired', 'Suspended', 'Cancelled', 'Withdrawn')
```

---

### API Usage

**Request:**
```
GET /api/properties?status=for_sale
GET /api/properties?status=for_lease
GET /api/properties?status=sold
GET /api/properties?status=leased
GET /api/properties?status=removed
```

**Default Behavior:**
- If no `status` parameter is provided, the filter defaults to `for_sale`
- The frontend should explicitly pass `status=for_sale` when "For Sale" is selected

**Response:**
The response includes properties matching the selected status according to the mapping rules above.

---

### Implementation Notes

1. **Complex OR Conditions**: For `for_sale` and `for_lease`, the filter requires OR logic combining direct MLS statuses with special cases that check `TransactionType`. Supabase PostgREST handles this using the `.or()` method.

2. **TransactionType Field**: The `TransactionType` field must be available in `PropertyView` for the special cases to work correctly.

3. **Performance**: Ensure proper indexes exist on `MlsStatus` and `TransactionType` columns for optimal query performance.

4. **Validation**: The backend validates that the status parameter matches one of the allowed values (`for_sale`, `for_lease`, `sold`, `leased`, `removed`).

---

## Future Filters

Additional filter documentation will be added to this file as filters are implemented:
- Date Listed Filter
- Primary Filters (City, Type, Price, Beds, Baths)
- Advanced Filters
- Quick Filters

