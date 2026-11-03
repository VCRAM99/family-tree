-- Integrity triggers.
-- The only kinship restriction is ancestry: a child cannot already be an ancestor of the parent.
-- Siblings, ages, cousin marriages, and unions between blood relatives are not restricted.
-- parent_links and unions may only connect people who belong to that row's tree.

CREATE OR REPLACE FUNCTION public.parent_links_reject_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT pl.parent_id
      FROM parent_links pl
      WHERE pl.child_id = NEW.parent_id
        AND pl.tree_id = NEW.tree_id
        AND pl.id <> NEW.id
      UNION
      SELECT pl.parent_id
      FROM parent_links pl
      INNER JOIN ancestors a ON pl.child_id = a.parent_id
      WHERE pl.tree_id = NEW.tree_id
        AND pl.id <> NEW.id
    )
    SELECT 1
    FROM ancestors
    WHERE parent_id = NEW.child_id
  ) THEN
    RAISE EXCEPTION 'parent_links: child is already an ancestor of parent'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.parent_links_same_tree()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_tree uuid;
  child_tree uuid;
  union_tree uuid;
BEGIN
  SELECT tree_id INTO parent_tree FROM persons WHERE id = NEW.parent_id;
  SELECT tree_id INTO child_tree FROM persons WHERE id = NEW.child_id;

  IF parent_tree IS NULL OR child_tree IS NULL THEN
    RAISE EXCEPTION 'parent_links: parent or child person not found'
      USING ERRCODE = '23503';
  END IF;

  IF parent_tree <> NEW.tree_id OR child_tree <> NEW.tree_id THEN
    RAISE EXCEPTION 'parent_links: persons must belong to the same tree'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.union_id IS NOT NULL THEN
    SELECT tree_id INTO union_tree FROM unions WHERE id = NEW.union_id;
    IF union_tree IS NULL OR union_tree <> NEW.tree_id THEN
      RAISE EXCEPTION 'parent_links: union must belong to the same tree'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.unions_same_tree()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  tree_a uuid;
  tree_b uuid;
BEGIN
  SELECT tree_id INTO tree_a FROM persons WHERE id = NEW.person_a_id;
  SELECT tree_id INTO tree_b FROM persons WHERE id = NEW.person_b_id;

  IF tree_a IS NULL OR tree_b IS NULL THEN
    RAISE EXCEPTION 'unions: person not found'
      USING ERRCODE = '23503';
  END IF;

  IF tree_a <> NEW.tree_id OR tree_b <> NEW.tree_id THEN
    RAISE EXCEPTION 'unions: persons must belong to the same tree'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS parent_links_reject_cycle_trg ON parent_links;
--> statement-breakpoint
CREATE TRIGGER parent_links_reject_cycle_trg
BEFORE INSERT OR UPDATE ON parent_links
FOR EACH ROW
EXECUTE FUNCTION public.parent_links_reject_cycle();
--> statement-breakpoint
DROP TRIGGER IF EXISTS parent_links_same_tree_trg ON parent_links;
--> statement-breakpoint
CREATE TRIGGER parent_links_same_tree_trg
BEFORE INSERT OR UPDATE ON parent_links
FOR EACH ROW
EXECUTE FUNCTION public.parent_links_same_tree();
--> statement-breakpoint
DROP TRIGGER IF EXISTS unions_same_tree_trg ON unions;
--> statement-breakpoint
CREATE TRIGGER unions_same_tree_trg
BEFORE INSERT OR UPDATE ON unions
FOR EACH ROW
EXECUTE FUNCTION public.unions_same_tree();
