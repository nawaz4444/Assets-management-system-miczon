# Server-Side Search & Filtering Implementation

## Problem
The dashboard search and filters were only working on the **currently loaded 50 assets** (client-side filtering). When searching or filtering, users could only see results from the visible page, not from all 194 assets in the database.

## Solution
Implemented **server-side filtering** where search and filter parameters are sent to the Django API, allowing searches across the entire database.

---

## Backend Changes (Django)

### 1. Updated `AssetViewSet.get_queryset()` in `views.py`

Added support for query parameters:
- `?search=` - Search across miczon_id, name, custodian name, and category
- `?department=` - Filter by department ID
- `?status=` - Filter by asset status (AVAILABLE, ASSIGNED, BROKEN, etc.)
- `?category=` - Filter by category (exact match, case-insensitive)

```python
def get_queryset(self):
    queryset = Asset.objects.all().select_related('custodian', 'department')
    
    if self.action == 'retrieve':
        queryset = queryset.prefetch_related('history', 'assignments', 'inspectionlog_set')
    
    queryset = queryset.order_by('-created_at')
    
    # Filter parameters
    custodian = self.request.query_params.get('custodian')
    department = self.request.query_params.get('department')
    status = self.request.query_params.get('status')
    category = self.request.query_params.get('category')
    search = self.request.query_params.get('search')
    
    if custodian:
        queryset = queryset.filter(custodian_id=custodian)
    if department:
        queryset = queryset.filter(department_id=department)
    if status:
        queryset = queryset.filter(current_status=status)
    if category:
        queryset = queryset.filter(category__iexact=category)
    if search:
        # Search across multiple fields using Q objects
        queryset = queryset.filter(
            Q(miczon_id__icontains=search) |
            Q(name__icontains=search) |
            Q(custodian__name__icontains=search) |
            Q(category__icontains=search)
        )
    
    return queryset
```

---

## Frontend Changes (React)

### 1. Updated `fetchData()` Function

Modified to build query parameters and send them to the API:

```javascript
const fetchData = (url = null, applyFilters = true) => {
    setLoading(true);
    
    // Build URL with query parameters for server-side filtering
    let apiUrl = url || 'http://127.0.0.1:8000/api/assets/';
    
    if (applyFilters && !url) {
        const params = new URLSearchParams();
        
        // Add filter parameters
        if (filterDept) params.append('department', filterDept);
        if (filterStatus) params.append('status', filterStatus);
        if (filterCategory) params.append('category', filterCategory);
        
        // Add search parameter
        if (searchTerm) params.append('search', searchTerm);
        
        const queryString = params.toString();
        if (queryString) {
            apiUrl += `?${queryString}`;
        }
    }
    
    axios.get(apiUrl, authConfig)
        .then(res => {
            setAssets(res.data.results);
            setNextPage(res.data.next);
            setPrevPage(res.data.previous);
            setTotalAssets(res.data.count);
        })
        .catch(handleError)
        .finally(() => setLoading(false));
};
```

### 2. Added `useEffect` for Auto-Filtering

Triggers API call whenever search term or filters change:

```javascript
// Trigger server-side search/filter when values change (with debouncing for search)
useEffect(() => {
    if (token) {
        // Debounce search term to avoid excessive API calls
        const timeoutId = setTimeout(() => {
            fetchData(); // This will apply current filters
        }, searchTerm ? 500 : 0); // 500ms delay for search, instant for filters
        
        return () => clearTimeout(timeoutId);
    }
}, [searchTerm, filterDept, filterStatus, filterCategory]);
```

### 3. Removed Client-Side Filtering

Deleted the `filteredAssets` logic since filtering now happens on the server:

```javascript
// REMOVED:
// const filteredAssets = assets.filter(asset => { ... });

// NOW: Use 'assets' directly (already filtered by API)
```

### 4. Updated Pagination Buttons

Pagination URLs from Django already include filter parameters, so we pass `false` to avoid re-applying filters:

```javascript
<Button onClick={() => fetchData(prevPage, false)}>Previous Page</Button>
<Button onClick={() => fetchData(nextPage, false)}>Next Page</Button>
```

---

## How It Works

### Example API Requests

1. **No filters**: `GET /api/assets/`
   - Returns first 50 assets (paginated)

2. **Search for "Dell"**: `GET /api/assets/?search=Dell`
   - Returns all assets matching "Dell" in name, miczon_id, custodian, or category

3. **Filter by department**: `GET /api/assets/?department=3`
   - Returns all assets in department ID 3

4. **Combined filters**: `GET /api/assets/?department=3&status=ASSIGNED&search=laptop`
   - Returns assigned laptops in department 3

5. **Pagination with filters**: `GET /api/assets/?department=3&page=2`
   - Django automatically preserves filters in next/prev URLs

---

## Performance Benefits

| Feature | Before | After |
|---------|--------|-------|
| **Search Scope** | Only 50 visible assets | All 194 assets in database |
| **Filter Scope** | Only current page | Entire database |
| **API Calls** | 1 per keystroke | Debounced (500ms delay) |
| **Database Load** | N/A | Optimized with indexed filters |
| **User Experience** | Confusing (missing results) | Accurate global search |

---

## Key Features

✅ **Global Search**: Searches across all assets, not just the current page  
✅ **Debounced Search**: 500ms delay to reduce API calls while typing  
✅ **Combined Filters**: Department + Status + Category + Search work together  
✅ **Preserved Pagination**: Filters persist when navigating pages  
✅ **Loading States**: Shows spinner during API calls  
✅ **Optimized Queries**: Uses Django Q objects for efficient OR searches  

---

## Testing Checklist

- [x] Search by asset name across all pages
- [x] Search by Miczon ID
- [x] Search by custodian name
- [x] Filter by department
- [x] Filter by status (Available, Assigned, Broken)
- [x] Filter by category
- [x] Combine multiple filters
- [x] Pagination preserves filters
- [x] Clear filters resets to all assets
- [x] Debouncing prevents excessive API calls

---

## Future Enhancements

1. **Advanced Search**: Add date range filters (created_at, last_inspection_date)
2. **Export Filtered Results**: Download CSV/PDF of filtered assets
3. **Save Filter Presets**: Let users save common filter combinations
4. **URL State**: Store filters in URL query params for shareable links
5. **Autocomplete**: Add search suggestions based on existing data
