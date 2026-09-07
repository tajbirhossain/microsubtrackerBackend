-- System categories aligned with the Android app catalog filters.

INSERT INTO categories (slug, name, is_system, user_id)
SELECT seed.slug, seed.name, TRUE, NULL
FROM (
  VALUES
    ('entertainment', 'Entertainment'),
    ('productivity', 'Productivity'),
    ('cloud', 'Cloud'),
    ('health', 'Health'),
    ('news', 'News'),
    ('shopping', 'Shopping')
) AS seed(slug, name)
WHERE NOT EXISTS (
  SELECT 1
  FROM categories c
  WHERE c.is_system = TRUE
    AND c.slug = seed.slug
);
