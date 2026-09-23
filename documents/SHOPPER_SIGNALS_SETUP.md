# Shopper Signals & "You May Like"

The homepage "You May Like" section ranks the catalogue against three signals:

| Signal | Weight | Stored in |
| --- | --- | --- |
| Purchased category | 5 | `transactions` (read via `/api/user/purchases`) |
| Viewed category | 2, decaying | `shopperSignals/{uid}` or device |
| Search matches product name | 3 | `shopperSignals/{uid}` or device |
| Search matches category | 2 | `shopperSignals/{uid}` or device |

The section renders **nothing** until the shopper has at least one signal, so a
brand-new account sees the normal homepage.

## Where signals live

| Shopper | Views & searches | Syncs across devices | Realtime |
| --- | --- | --- | --- |
| Signed in | `shopperSignals/{uid}` in Firestore | Yes | Yes, via `onSnapshot` |
| Guest | `localStorage` on that device | No | Same-device tabs only |

When a guest signs in or registers, whatever they browsed beforehand is merged
into their account once (`mergeGuestSignalsInto`), then the guest bucket is
cleared so the next person using that browser does not inherit it.

## Required Firestore security rule

**This collection holds personal browsing history and must be locked to its
owner.** There is no `firestore.rules` file in this repo — rules are managed in
the Firebase console — so add this rule there:

```
match /databases/{database}/documents {
  match /shopperSignals/{uid} {
    allow read, write: if request.auth != null && request.auth.uid == uid;
  }
}
```

Until that rule exists, reads and writes will be denied. The app degrades
quietly in that case: the listener logs the error and reports "no signals", so
the section simply stays hidden rather than breaking the homepage. If the
section never appears for a signed-in shopper, check the browser console for a
permission error first.

Do **not** make this collection world-readable. Browsing history is more
sensitive than the catalogue data around it.

## Document shape

`shopperSignals/{uid}`:

```
{
  uid: string,
  views:    [{ productId, name?, category?, viewedAt:  number }],  // max 20
  searches: [{ term,                        searchedAt: number }], // max 10
  updatedAt: number
}
```

Timestamps are epoch millis rather than Firestore `Timestamp`s so that device
and account entries merge with the same comparison logic.

Lists are newest-first, de-duplicated by `productId` / `term`, and capped.
Writes are read-modify-write rather than `arrayUnion`, because the list is
ordered, de-duplicated and capped — none of which an array union can express.
Two tabs racing means last-write-wins, which is acceptable for taste data.

## Tuning

Constants live at the top of the source files:

- `src/lib/recommendations/history.ts` — `MAX_VIEWS` (20), `MAX_SEARCHES` (10),
  `MIN_SEARCH_LENGTH` (3).
- `src/lib/recommendations/score.ts` — `DEFAULT_WEIGHTS`,
  `VIEW_HALF_LIFE_DAYS` (14), `SEEN_PENALTY` (0.35).

## Behaviour notes

- Only **committed** searches are recorded (Enter or the search button), not the
  350 ms live-typing path, otherwise history fills with prefixes of one word.
- A product's category is read from `Product.description`. The Firestore mapper
  assigns `description: data.category || data.description` and never populates
  `Product.category`, so reading that field would silently score everything
  zero. `categoryOf()` in `score.ts` is the only place that knows this.
- Purchased products are excluded from results; merely viewed products are
  demoted by `SEEN_PENALTY`, not removed, so a thin category still fills the row.
- Out-of-stock items always sort last.
- Recommendations are scoped to the branch selected in the nav bar.

## Clearing history

`clearSignals(uid)` from `src/lib/recommendations/signals.ts` wipes an account's
signals (or the guest bucket when called with no uid). No UI is wired to it yet
— worth adding to the profile page if you want shoppers to be able to reset
their recommendations.
