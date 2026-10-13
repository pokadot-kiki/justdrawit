# Profile avatar upload: setup needed before use

The code uses the existing Firebase project and Auth account. No bucket or credentials are created by this feature.

1. Enable Cloud Storage for Firebase in the same Firebase project used by Login.
2. Set `VITE_FIREBASE_STORAGE_BUCKET` for the client and `FIREBASE_STORAGE_BUCKET` for the server to the exact same bucket name shown in Firebase Console. Do not include `gs://`.
3. Deploy the rules in `firebase.storage.rules.example` to that bucket. They allow each signed-in UID to read, replace, and delete only `avatars/{uid}/profile`, and restrict uploads to JPG, PNG, or WebP of at most 2 MiB.
4. Install the new client dependency with `npm install --prefix client` when npm registry access is available. This also updates `client/package-lock.json`.

The game checks both client and server Storage configuration before saving. Without this setup, the upload dialog reports that Storage is unavailable and keeps the existing avatar.
