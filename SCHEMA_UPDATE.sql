// ===== إضافة في schema.sql - تعديل جدول kvaults =====

-- إضافة عمود root_paths (JSON array للمجلدات الجذرية)
ALTER TABLE kvaults ADD COLUMN root_paths TEXT DEFAULT '[]';

-- مثال:
-- UPDATE kvaults SET root_paths = '["manga", "manhwa", "original"]' WHERE id = 1;
