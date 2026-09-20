# Deploy Firestore Indexes for Performance

## Quick Setup

### Option 1: Using Firebase CLI (Recommended)

1. **Install Firebase CLI** (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:
   ```bash
   firebase login
   ```

3. **Initialize Firebase in your project** (if not already done):
   ```bash
   firebase init firestore
   # Select your Firebase project
   # Accept default firestore.rules
   # Accept default firestore.indexes.json
   ```

4. **Deploy the indexes**:
   ```bash
   firebase deploy --only firestore:indexes
   ```

### Option 2: Manual Creation in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database** → **Indexes** → **Composite**
4. Click **Create Index**
5. Configure:
   - **Collection ID**: `transactions`
   - **Fields to index**:
     - Field: `customer.uid`, Order: `Ascending`
     - Field: `timestamp`, Order: `Descending`
   - **Query scopes**: Collection
6. Click **Create**
7. Wait for index creation (usually 1-5 minutes)

### Option 3: Programmatic Creation

```javascript
// Using Firebase Admin SDK (for server-side deployment)
const admin = require('firebase-admin');

async function createIndex() {
  const db = admin.firestore();
  
  // This is automatically handled when you run the query
  // Firestore will suggest the index and provide a link
  try {
    const query = db.collection('transactions')
      .where('customer.uid', '==', 'test-uid')
      .orderBy('timestamp', 'desc')
      .limit(1);
      
    await query.get();
  } catch (error) {
    if (error.code === 'failed-precondition') {
      console.log('Index required. Create it here:', error.message);
      // The error message contains a direct link to create the index
    }
  }
}
```

## Verify Index Creation

1. **Check Firebase Console**:
   - Go to Firestore → Indexes
   - Look for status: "Building" → "Enabled"

2. **Test the Query**:
   ```javascript
   // This should work without errors once index is ready
   const purchases = await db.collection('transactions')
     .where('customer.uid', '==', userId)
     .orderBy('timestamp', 'desc')
     .limit(20)
     .get();
   ```

3. **Monitor Performance**:
   - Initial query should be under 500ms
   - Subsequent pagination queries under 200ms

## Troubleshooting

### Error: "Failed Precondition"
```
The query requires an index. You can create it here: https://console.firebase.google.com/...
```
**Solution**: Click the provided link or create the index manually.

### Error: "Permission Denied"
**Solution**: Check Firestore security rules allow the query.

### Slow Performance After Index
**Possible Causes**:
1. Index still building (check console)
2. Too much data being returned (increase pagination)
3. Network latency (check from different location)

## Index Configuration Details

The required composite index:

```json
{
  "indexes": [
    {
      "collectionGroup": "transactions",
      "queryScope": "COLLECTION", 
      "fields": [
        {
          "fieldPath": "customer.uid",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "timestamp", 
          "order": "DESCENDING"
        }
      ]
    }
  ]
}
```

This index enables:
- Fast queries filtered by user ID
- Results sorted by newest first  
- Efficient pagination with cursors
- Consistent sub-second performance

## Performance Impact

**Before Index**:
- Query time: 2-15 seconds
- Reads: All user documents
- Firestore usage: High

**After Index**: 
- Query time: 50-500ms
- Reads: Only requested page (20 documents)
- Firestore usage: Minimal

The index is essential for production performance with the optimized purchases page.