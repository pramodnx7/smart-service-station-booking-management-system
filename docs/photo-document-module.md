# Image & Document Management

Application records remain in Firebase Firestore. Supabase is used only for file storage; Firestore stores public URLs and storage metadata.

## Configuration

Create a public Supabase Storage bucket named `service-station`, then add these server-only values to `.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-private-service-role-key
SUPABASE_STORAGE_BUCKET=service-station
```

Never expose the service-role key in browser JavaScript or commit it to Git.

## Storage folders

- `customers/`: customer profile images
- `vehicles/`: front, rear, left, right, interior, and engine images
- `mechanics/`: profile and NIC images
- `services/`: service evidence and package images
- `inventory/`: inventory item images
- `company/`: company, invoice, and workshop branding
- `documents/`: certificates and PDFs

Supported image types are JPG/JPEG, PNG, and WebP. PDFs are accepted only in the documents folder. The maximum file size is 5 MB.

## Failure safety

The browser uploads through authenticated API routes. New files are deleted automatically when the related Firestore save fails. Replaced files are deleted only after Firestore succeeds. Deleting a customer, vehicle, mechanic, inventory item, service, or uploaded service file also removes its Supabase objects.

## APIs

- `POST /api/images/upload`
- `POST /api/images/replace`
- `DELETE /api/images`
- `POST /api/technician/jobs/:id/photos/upload`
- `POST /api/technician/jobs/:id/documents/upload`
- `POST /api/admin/service-jobs/:id/photos/upload`
- `POST /api/admin/service-jobs/:id/documents/upload`
- `GET /api/files/:kind/:id/download`
- `DELETE /api/admin/files/:kind/:id`
