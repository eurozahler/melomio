-- Preis-Snapshots sind unveränderlich (Pflichtenheft Abschnitt 6).
-- Die Datenbank selbst lehnt jede Änderung ab, egal ob sie aus der App, einem Skript oder von Hand kommt.
-- Löschen bleibt möglich (z. B. Löschanfrage nach DSGVO zusammen mit der Bestellung).
CREATE OR REPLACE FUNCTION forbid_price_snapshot_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Preis-Snapshots sind unveraenderlich (price_snapshots.id = %)', OLD.id
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER price_snapshots_immutable
  BEFORE UPDATE ON price_snapshots
  FOR EACH ROW EXECUTE FUNCTION forbid_price_snapshot_update();
