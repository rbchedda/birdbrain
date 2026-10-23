update storage.buckets set file_size_limit = null, allowed_mime_types = null where id in ('post-photos', 'diary-photos');
